'use strict';

/**
 * Shared auth / authorization helpers.
 *
 * Design:
 * - The deployed path relies on the API Gateway HTTP API Cognito JWT authorizer
 *   to VERIFY tokens. The Lambda then reads verified claims from
 *   `event.requestContext.authorizer.jwt.claims` (exposed by serverless-http as
 *   `req.requestContext.authorizer.jwt.claims`) or from the Bearer token payload
 *   as a fallback.
 * - These helpers NEVER verify signatures themselves — they only parse claims
 *   that the authorizer has already verified, or (local dev / unit tests) parse
 *   a mock token payload. Signature verification without the authorizer would
 *   give a false sense of security, so production must keep the authorizer.
 * - Never trust a role sent by the frontend — role comes only from the
 *   `cognito:groups` claim.
 */

const AGENT_GROUP = 'Agent';

/**
 * API Gateway HTTP API flattens JWT claims to strings. Depending on the
 * Cognito/API Gateway representation, cognito:groups can arrive as any of:
 *   ['Agent']          (array, local tests / decoded token)
 *   '["Agent"]'      (JSON string)
 *   '[Agent]'          (API Gateway-style bracket string)
 *   'Customer,Agent'   (comma separated string)
 * Normalize every form so backend authorization matches the SPA.
 */
function normalizeGroupClaim(raw) {
  if (Array.isArray(raw)) return raw.map((g) => String(g).trim()).filter(Boolean);
  if (raw === undefined || raw === null) return [];
  const text = String(raw).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((g) => String(g).trim()).filter(Boolean);
  } catch {
    // Cognito/API Gateway commonly exposes array claims as [Agent] (not JSON).
  }

  const unwrapped = text.startsWith('[') && text.endsWith(']')
    ? text.slice(1, -1)
    : text;

  return unwrapped
    .split(',')
    .map((g) => g.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function base64UrlDecodeToJson(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const json = Buffer.from(padded + '='.repeat(padLength), 'base64').toString('utf8');
  return JSON.parse(json);
}

/** Decode the payload of a JWT without verifying (local/test use only). */
function decodeJwtPayloadNoVerify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = base64UrlDecodeToJson(parts[1]);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Extract raw claims from an Express request (authorizer context first). */
function getClaimsFromRequest(req) {
  if (!req) return null;
  // Unit-test injection hook (never set by API Gateway).
  if (req.authClaims && typeof req.authClaims === 'object') return req.authClaims;

  const ctxClaims =
    req.requestContext?.authorizer?.jwt?.claims ||
    req.apiGateway?.event?.requestContext?.authorizer?.jwt?.claims;
  if (ctxClaims && typeof ctxClaims === 'object') return ctxClaims;

  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return decodeJwtPayloadNoVerify(header.slice(7).trim());
  }
  return null;
}

/** Normalize verified claims into an app user. Returns null when unauthenticated. */
function getUserFromClaims(claims) {
  if (!claims || typeof claims !== 'object') return null;
  // Local mock tokens are never valid here — not even as a fallback. The local
  // dev server (server.js) verifies them via src/lib/mockUsers.js instead.
  if (claims.mock === true) return null;
  const sub = claims.sub || claims.username || claims['cognito:username'];
  if (!sub) return null;

  const groups = normalizeGroupClaim(claims['cognito:groups']);
  const role = groups.includes(AGENT_GROUP) ? 'Agent' : 'Customer';
  return {
    sub: String(sub),
    email: claims.email ? String(claims.email) : null,
    groups,
    role
  };
}

function isAgent(user) {
  return !!user && user.role === 'Agent';
}

/** Owner-or-agent check for a ticket document. */
function canViewTicket(ticket, user) {
  if (!ticket || !user) return false;
  if (isAgent(user)) return true;
  const owner = ticket.createdBy || ticket.ownerId;
  return owner === user.sub || (user.email !== null && owner === user.email);
}

/** Only agents may update status/assignee. */
function canUpdateTicket(user) {
  return isAgent(user);
}

/** Only the ticket owner or an agent may read/add comments. */
function canAccessComments(ticket, user) {
  return canViewTicket(ticket, user);
}

/**
 * Express middleware factory.
 * - aws-server.js (deployed): use attachUser({ required: true }).
 * - server.js (local demo fallback): use attachUser({ required: false }) so the
 *   existing no-token demo keeps working; requests WITH a token still get a real user.
 */
function attachUser({ required = true } = {}) {
  return (req, res, next) => {
    const claims = getClaimsFromRequest(req);
    const user = getUserFromClaims(claims);
    if (!user) {
      if (required) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid authentication is required.' } });
      }
      req.user = { sub: 'local-demo-user', email: null, groups: [], role: 'Customer', demo: true };
      return next();
    }
    req.user = user;
    return next();
  };
}

/**
 * Extract the app user from an API Gateway HTTP API v2 event.
 * Claims come from the JWT authorizer (verified upstream); a Bearer token
 * payload is accepted as a local-test fallback only.
 */
function getUserFromLambdaEvent(event) {
  const claims =
    event?.requestContext?.authorizer?.jwt?.claims ||
    decodeJwtPayloadNoVerify(bearerOf(event?.headers));
  return getUserFromClaims(claims);
}

function bearerOf(headers = {}) {
  const entries = Object.entries(headers || {});
  for (const [k, v] of entries) {
    if (k.toLowerCase() === 'authorization' && typeof v === 'string' && v.toLowerCase().startsWith('bearer ')) {
      return v.slice(7).trim();
    }
  }
  return null;
}

function requireAgent(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid authentication is required.' } });
  }
  if (!isAgent(req.user)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Agent role is required.' } });
  }
  return next();
}

module.exports = {
  AGENT_GROUP,
  normalizeGroupClaim,
  decodeJwtPayloadNoVerify,
  getClaimsFromRequest,
  getUserFromClaims,
  getUserFromLambdaEvent,
  isAgent,
  canViewTicket,
  canUpdateTicket,
  canAccessComments,
  attachUser,
  requireAgent
};
