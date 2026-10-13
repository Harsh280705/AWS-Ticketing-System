'use strict';

/**
 * Local development API — JSON-file persistence + mock authentication.
 *
 * This is the runnable local equivalent of the production stack. It enforces
 * the SAME authorization rules as backend/aws-server.js (401/403/404) but
 * authenticates via deterministic mock tokens instead of Cognito JWTs.
 *
 * Identity comes ONLY from the verified mock token (fixture lookup) — never
 * from request-body fields. Mock auth exists ONLY here: aws-server.js and
 * lambda.js never import src/lib/mockUsers.js, and getUserFromClaims()
 * rejects mock:true claims outright.
 *
 * Local-only routes (never deployed): /auth/mock-users, /auth/mock-login,
 * /auth/mock-me, PUT /mock-uploads/*, GET /mock-uploads/*.
 * The 7 ticket routes keep their exact production paths.
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { sendError } = require('./src/lib/response');
const {
  validateCreateTicket,
  validateUpdateTicket,
  pickAssignee,
  validateAttachmentKeys,
  validateComment,
  filterTickets,
  scopeTicketsToUser
} = require('./src/lib/validation');
const { canViewTicket, canAccessComments } = require('./src/lib/auth');
const { validatePresignedRequest, sanitizeFilename, displayNameFromKey, MAX_FILE_BYTES, ALLOWED_MIME } = require('./src/lib/uploads');
const {
  isMockAuthEnabled,
  findMockUser,
  publicMockUsers,
  mintMockToken,
  verifyMockToken,
  MOCK_TOKEN_TTL_SEC
} = require('./src/lib/mockUsers');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'tickets.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb' }));

// ---------- persistence (JSON file mirrors the two-table shape) ----------
// Ticket item: Tickets row incl. embedded activity[] (+ comments[] as the local
// stand-in for TicketComments rows) and attachments[] metadata.
// Documented mapping: docs/ARCHITECTURE.md.

function loadTickets() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map((t) => ({
      ...t,
      activity: Array.isArray(t.activity) ? t.activity : [],
      comments: Array.isArray(t.comments) ? t.comments : [],
      attachments: Array.isArray(t.attachments) ? t.attachments : [],
      attachmentKeys: Array.isArray(t.attachmentKeys) ? t.attachmentKeys : []
    }));
  } catch {
    throw new Error('Ticket data file is invalid JSON.');
  }
}

function saveTickets(tickets) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
}

function findTicket(tickets, id) {
  return tickets.find((t) => t.id === id || t.ticketId === id);
}

function ticketIdOf(t) {
  return t.ticketId || t.id;
}

// ---------- mock auth (local only) ----------

function requireMockAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(header);
  const user = match ? verifyMockToken(match[1].trim()) : null;
  if (!user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Valid authentication is required.');
  }
  req.user = user;
  return next();
}

function mockOnly(req, res, next) {
  if (!isMockAuthEnabled()) {
    return sendError(res, 404, 'NOT_FOUND', 'Not found.');
  }
  return next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ticketing-api', mode: 'local-mock' });
});

// Local-only: safe user directory for the mock login screen (no secrets exist).
app.get('/auth/mock-users', mockOnly, (_req, res) => {
  res.json({ users: publicMockUsers(), mock: true });
});

// Local-only: mint a mock token for a fixture user. No passwords involved.
app.post('/auth/mock-login', mockOnly, (req, res) => {
  const { userId } = req.body || {};
  const fixture = findMockUser(userId);
  if (!fixture) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown test user. Choose customer-a, customer-b, or agent-1.');
  }
  const token = mintMockToken(fixture.sub);
  res.json({
    token,
    expiresIn: MOCK_TOKEN_TTL_SEC,
    mock: true,
    user: { sub: fixture.sub, email: fixture.email, name: fixture.name, role: fixture.role }
  });
});

// Local-only: validate the current mock session (used on page reload).
app.get('/auth/mock-me', mockOnly, (req, res) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(header);
  const user = match ? verifyMockToken(match[1].trim()) : null;
  if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Valid authentication is required.');
  res.json({ user: { sub: user.sub, email: user.email, name: user.name, role: user.role }, mock: true });
});

// ---------- the seven exact routes (auth enforced) ----------

app.post('/tickets', requireMockAuth, (req, res) => {
  const checked = validateCreateTicket(req.body || {});
  if (!checked.valid) return sendError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));
  const keyCheck = validateAttachmentKeys((req.body || {}).attachmentKeys, req.user.sub, ['local/']);
  if (!keyCheck.valid) return sendError(res, 400, 'VALIDATION_ERROR', keyCheck.errors.join(' '));

  const tickets = loadTickets();
  const now = new Date().toISOString();
  const id = randomUUID();
  const ticket = {
    ticketId: id,
    id,
    title: checked.value.title,
    description: checked.value.description,
    priority: checked.value.priority,
    category: checked.value.category,
    status: 'Open',
    createdBy: req.user.sub,
    createdByEmail: req.user.email,
    assignee: 'Unassigned',
    attachmentKeys: keyCheck.value,
    attachments: keyCheck.value.map((key) => metaForLocalKey(key)),
    createdAt: now,
    updatedAt: now,
    activity: [{ type: 'CREATED', actorId: req.user.sub, detail: 'Ticket created', createdAt: now }],
    comments: []
  };
  tickets.unshift(ticket);
  saveTickets(tickets);
  return res.status(201).json({ ticket });
});

app.get('/tickets', requireMockAuth, (req, res) => {
  const owned = scopeTicketsToUser(loadTickets(), req.user);
  const tickets = filterTickets(owned, req.query || {});
  return res.json({ tickets, count: tickets.length });
});

app.get('/tickets/:ticketId', requireMockAuth, (req, res) => {
  const ticket = findTicket(loadTickets(), req.params.ticketId);
  if (!ticket || !canViewTicket(ticket, req.user)) {
    return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }
  return res.json({ ticket });
});

app.put('/tickets/:ticketId', requireMockAuth, (req, res) => {
  if (req.user.role !== 'Agent') {
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }
  const checked = validateUpdateTicket(req.body || {});
  if (!checked.valid) return sendError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const tickets = loadTickets();
  const ticket = findTicket(tickets, req.params.ticketId);
  if (!ticket) return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');

  const { status, priority } = req.body || {};
  const { value: effectiveAssignee, key: assigneeKey } = pickAssignee(req.body || {});
  const now = new Date().toISOString();

  if (status && status !== ticket.status) {
    ticket.activity.push({ type: 'STATUS_CHANGED', actorId: req.user.sub, detail: `Status changed to ${status}`, createdAt: now });
    ticket.status = status;
  }
  if (effectiveAssignee && effectiveAssignee !== ticket.assignee) {
    ticket.activity.push({ type: 'ASSIGNED', actorId: req.user.sub, detail: `Assigned to ${effectiveAssignee}`, createdAt: now });
    ticket.assignee = effectiveAssignee;
    if (assigneeKey === 'assigneeId') ticket.assigneeId = effectiveAssignee;
  }
  if (priority) ticket.priority = priority;
  ticket.updatedAt = now;
  saveTickets(tickets);
  return res.json({ ticket });
});

app.post('/tickets/:ticketId/comments', requireMockAuth, (req, res) => {
  const checked = validateComment(req.body || {});
  if (!checked.valid) return sendError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const tickets = loadTickets();
  const ticket = findTicket(tickets, req.params.ticketId);
  if (!ticket || !canAccessComments(ticket, req.user)) {
    return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  const now = new Date().toISOString();
  const comment = {
    id: randomUUID(),
    text: checked.value.text,
    authorId: req.user.sub,
    authorRole: req.user.role,
    createdAt: now
  };
  ticket.comments.push(comment);
  ticket.comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  ticket.activity.push({ type: 'COMMENT_ADDED', actorId: req.user.sub, detail: 'New comment added', createdAt: now });
  ticket.updatedAt = now;
  saveTickets(tickets);
  return res.status(201).json({ comment });
});

app.get('/tickets/:ticketId/comments', requireMockAuth, (req, res) => {
  const ticket = findTicket(loadTickets(), req.params.ticketId);
  if (!ticket || !canAccessComments(ticket, req.user)) {
    return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }
  const comments = [...ticket.comments].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return res.json({ comments });
});

// Local clearly-labeled mock of the production presigned-url route: reserves a
// namespaced key and tells the browser where to PUT the bytes (local disk).
// NEVER a real S3 URL — the `mock: true` flag makes that explicit.
app.post('/tickets/presigned-url', requireMockAuth, (req, res) => {
  const checked = validatePresignedRequest(req.body || {});
  if (!checked.valid) return sendError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const { filename, contentType } = checked.value;
  const key = `local/${req.user.sub}/${randomUUID()}-${filename}`;
  const base = `${req.protocol}://${req.get('host')}`;
  return res.json({
    uploadUrl: `${base}/mock-uploads/${key}`,
    key,
    expiresIn: 300,
    mock: true
  });
});

// ---------- local-only mock upload / download (never deployed) ----------

// Build attachment metadata for a `local/<owner>/<file>` key supplied at ticket
// creation (file was uploaded beforehand). Falls back to key-derived metadata
// when the bytes are gone; never throws.
function metaForLocalKey(key) {
  const parts = String(key).split('/');
  const owner = parts[1] || '';
  const stored = parts.slice(2).join('/');
  const filename = displayNameFromKey(stored.split('/').pop() || stored);
  const resolved = path.resolve(UPLOAD_DIR, owner, stored.split('/').pop() || '');
  let size = 0;
  try {
    if (stored && !stored.includes('..') && fs.existsSync(resolved)) {
      size = fs.statSync(resolved).size;
    }
  } catch {
    size = 0;
  }
  const ext = filename.split('.').pop().toLowerCase();
  const contentType =
    ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain' })[ext] ||
    'application/octet-stream';
  return { key, filename, contentType, size, url: `/mock-uploads/${key}`, mock: true };
}

function keyToSafePath(key) {  const parts = String(key || '').split('/');
  if (parts.length < 3 || parts[0] !== 'local') return null;
  const owner = parts[1];
  const rest = parts.slice(2).join('/');
  if (!rest || rest.includes('..')) return null;
  const safe = sanitizeFilename(rest.split('/').pop());
  if (!safe) return null;
  const resolved = path.resolve(UPLOAD_DIR, owner, safe);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  return { resolved, owner, filename: safe };
}

app.put(/^\/mock-uploads\/(.+)$/, mockOnly, express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(header);
  const user = match ? verifyMockToken(match[1].trim()) : null;
  if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Valid authentication is required.');

  const mapped = keyToSafePath(req.params[0]);
  if (!mapped) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid upload key.');
  if (mapped.owner !== user.sub) {
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  }

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  if (!ALLOWED_MIME.has(contentType)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported content type.');
  }
  const size = Buffer.isBuffer(req.body) ? req.body.length : 0;
  if (size <= 0 || size > MAX_FILE_BYTES) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'File must be between 1 byte and 5 MB.');
  }

  fs.mkdirSync(path.dirname(mapped.resolved), { recursive: true });
  fs.writeFileSync(mapped.resolved, req.body);

  const meta = {
    key: `local/${mapped.owner}/${mapped.filename}`,
    filename: displayNameFromKey(mapped.filename),
    contentType,
    size,
    url: `/mock-uploads/local/${mapped.owner}/${mapped.filename}`,
    mock: true
  };

  // Associate with the ticket when ?ticketId= names a ticket visible to the user.
  const ticketId = req.query.ticketId ? String(req.query.ticketId) : null;
  if (ticketId) {
    const tickets = loadTickets();
    const ticket = findTicket(tickets, ticketId);
    if (!ticket || !canViewTicket(ticket, user)) {
      return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
    }
    if (!ticket.attachments.some((a) => a.key === meta.key)) {
      ticket.attachments.push(meta);
      if (!ticket.attachmentKeys.includes(meta.key)) ticket.attachmentKeys.push(meta.key);
      ticket.updatedAt = new Date().toISOString();
      saveTickets(tickets);
    }
  }

  return res.status(200).json({ key: meta.key, filename: meta.filename, size, mock: true });
});

app.get(/^\/mock-uploads\/(.+)$/, mockOnly, (req, res) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(header);
  const user = match ? verifyMockToken(match[1].trim()) : null;
  if (!user) return sendError(res, 401, 'UNAUTHORIZED', 'Valid authentication is required.');

  const mapped = keyToSafePath(req.params[0]);
  if (!mapped) return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  if (mapped.owner !== user.sub && user.role !== 'Agent') {
    return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }
  if (!fs.existsSync(mapped.resolved)) return sendError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  return res.sendFile(mapped.resolved);
});

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  if (err && err.type === 'entity.too.large') {
    return sendError(res, 413, 'VALIDATION_ERROR', 'File must be between 1 byte and 5 MB.');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Ticketing API (local mock mode) running at http://localhost:${PORT}`);
  });
}
