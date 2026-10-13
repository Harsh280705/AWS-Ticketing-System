'use strict';

/**
 * Deterministic local mock identities — DEVELOPMENT ONLY.
 *
 * These accounts let the app run end-to-end without Cognito. They carry no
 * passwords and no secrets; a mock token is worthless outside this machine.
 *
 * Production exclusion is structural, not conventional:
 *  - Only backend/server.js imports this module (gated by ALLOW_MOCK_AUTH).
 *  - backend/aws-server.js and backend/lambda.js NEVER import it.
 *  - src/lib/auth.js getUserFromClaims() explicitly rejects claims with
 *    mock:true, so a mock token can never authenticate the production path —
 *    even if pasted into an Authorization header.
 */

const MOCK_USERS = [
  { sub: 'customer-a', email: 'customer-a@example.com', name: 'Customer A', role: 'Customer', groups: [] },
  { sub: 'customer-b', email: 'customer-b@example.com', name: 'Customer B', role: 'Customer', groups: [] },
  { sub: 'agent-1', email: 'agent-1@example.com', name: 'Agent One', role: 'Agent', groups: ['Agent'] }
];

const MOCK_TOKEN_TTL_SEC = 12 * 60 * 60; // 12 hours

function isMockAuthEnabled(env = process.env) {
  return env.ALLOW_MOCK_AUTH !== 'false';
}

function findMockUser(sub) {
  return MOCK_USERS.find((u) => u.sub === sub) || null;
}

/** Safe for the login screen: no secrets exist on these fixtures. */
function publicMockUsers() {
  return MOCK_USERS.map(({ sub, email, name, role }) => ({ sub, email, name, role }));
}

function mintMockToken(sub, nowSec = Math.floor(Date.now() / 1000)) {
  const fixture = findMockUser(sub);
  if (!fixture) return null;
  const payload = { sub: fixture.sub, mock: true, iat: nowSec, exp: nowSec + MOCK_TOKEN_TTL_SEC };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `mock.${b64}.local`;
}

/**
 * Verify a mock token. Role ALWAYS comes from the fixture — a tampered `role`
 * claim inside the token is ignored, so privilege escalation via token editing
 * is impossible (proven by tests).
 */
function verifyMockToken(token, nowSec = Math.floor(Date.now() / 1000)) {
  if (!isMockAuthEnabled()) return null;
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'mock' || parts[2] !== 'local') return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.mock !== true || typeof payload.sub !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  const fixture = findMockUser(payload.sub);
  if (!fixture) return null;
  return { sub: fixture.sub, email: fixture.email, name: fixture.name, role: fixture.role, groups: [...fixture.groups], mock: true };
}

module.exports = {
  MOCK_USERS,
  MOCK_TOKEN_TTL_SEC,
  isMockAuthEnabled,
  findMockUser,
  publicMockUsers,
  mintMockToken,
  verifyMockToken
};
