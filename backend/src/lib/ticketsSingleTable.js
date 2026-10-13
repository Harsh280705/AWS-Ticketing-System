'use strict';

/**
 * Single-table DynamoDB data-access for the REQUIRED production table
 * `tkt-tickets` (pk S, sk S) — building-plan schema. NOT YET WIRED TO HANDLERS:
 * the table does not exist and must be approved first (Stage 3). Same function
 * signatures as src/lib/tickets.js so the seven handlers rewire by import swap.
 *
 * Layout per ticket <id>:
 *   { pk: TICKET#<id>, sk: META }                  ticket attributes
 *   { pk: TICKET#<id>, sk: ACTIVITY#<time>#<uuid>} activity entries
 *   { pk: TICKET#<id>, sk: COMMENT#<time>#<uuid> } comment entries
 *
 * All functions take an injected `db` ({ send(cmd) }); unit tests use an
 * in-memory fake. No AWS calls. Coded errors via httpError().
 */

const { randomUUID } = require('crypto');
const {
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');

const { canViewTicket, canAccessComments } = require('./auth');
const {
  validateCreateTicket,
  validateUpdateTicket,
  pickAssignee,
  validateAttachmentKeys,
  validateComment,
  filterTickets,
  scopeTicketsToUser
} = require('./validation');
const { displayNameFromKey } = require('./uploads');
const { planPresignedUpload } = require('./tickets');
const { httpError } = require('./response');

const REQUIRED_TABLE = 'tkt-tickets';
const DOWNLOAD_EXPIRY_SECONDS = 300;

function tableFromEnv(env = process.env) {
  // Deployment contract name is TABLE_NAME (value: tkt-tickets);
  // TICKETS_TABLE / TKT_TABLE accepted as aliases. Never points at legacy tables.
  return { table: env.TABLE_NAME || env.TICKETS_TABLE || env.TKT_TABLE || REQUIRED_TABLE };
}

function attachmentsBucket(env = process.env) {
  return env.BUCKET_NAME || env.ATTACHMENTS_BUCKET || null;
}

/**
 * Presigned S3 GET for a ticket attachment key (browser download).
 * Returns null when no bucket is configured — no S3 call, no error.
 * Signing itself needs no IAM action; the issued URL authorizes against the
 * Lambda execution role, which is why that role needs s3:GetObject.
 */
async function defaultGetSigner(key) {
  const bucket = attachmentsBucket();
  if (!bucket) return null;
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-2' });
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: DOWNLOAD_EXPIRY_SECONDS }
  );
}

function pkFor(ticketId) {
  return `TICKET#${ticketId}`;
}

function ticketIdFromPk(pk) {
  return String(pk || '').startsWith('TICKET#') ? String(pk).slice('TICKET#'.length) : String(pk);
}

function toPublicTicket(meta, comments = [], activity = []) {
  if (!meta) return null;
  const id = ticketIdFromPk(meta.pk);
  return {
    ticketId: id,
    id,
    title: meta.title,
    description: meta.description,
    priority: meta.priority,
    category: meta.category,
    status: meta.status,
    createdBy: meta.createdBy,
    createdByEmail: meta.createdByEmail || null,
    assignee: meta.assignee || 'Unassigned',
    assigneeId: meta.assigneeId || null,
    attachmentKeys: meta.attachmentKeys || [],
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    activity,
    comments
  };
}

async function getMetaItem(db, table, ticketId) {
  const out = await db.send(new GetCommand({
    TableName: table,
    Key: { pk: pkFor(ticketId), sk: 'META' }
  }));
  return out.Item || null;
}

async function queryItems(db, table, ticketId, prefix) {
  const out = await db.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': pkFor(ticketId), ':prefix': prefix },
    ScanIndexForward: true
  }));
  return out.Items || [];
}

/**
 * Build the `attachments[]` view from stored keys. `getDownloadUrl(key)` is
 * injected (presigned S3 GET in production); when absent (unconfigured bucket,
 * unit tests) entries carry `url: null` and the UI hides the download button.
 */
async function attachFiles(ticket, getDownloadUrl) {
  const keys = ticket.attachmentKeys || [];
  ticket.attachments = await Promise.all(keys.map(async (key) => {
    const filename = displayNameFromKey(String(key).split('/').pop());
    let url = null;
    if (getDownloadUrl) {
      try {
        url = await getDownloadUrl(key);
      } catch {
        url = null;
      }
    }
    return { key, filename, url };
  }));
  return ticket;
}

async function withComments(db, table, meta, getDownloadUrl) {
  if (!meta) return null;
  // Ticket metadata is the primary record. Comments/activity are enrichment and
  // must not make the entire detail/update request fail if one secondary Query
  // has a transient problem. Keep both panels usable and return what succeeded.
  const [commentResult, activityResult] = await Promise.allSettled([
    queryItems(db, table, ticketIdFromPk(meta.pk), 'COMMENT#'),
    queryItems(db, table, ticketIdFromPk(meta.pk), 'ACTIVITY#')
  ]);
  const commentItems = commentResult.status === 'fulfilled' ? commentResult.value : [];
  const activityItems = activityResult.status === 'fulfilled' ? activityResult.value : [];
  const comments = commentItems.map((c) => ({
    id: c.commentId,
    text: c.text,
    authorId: c.authorId,
    authorRole: c.authorRole,
    authorEmail: c.authorEmail || null,
    createdAt: c.createdAt
  }));
  const activity = activityItems.map((a) => ({
    type: a.type,
    actorId: a.actorId,
    detail: a.detail,
    createdAt: a.createdAt
  }));
  return attachFiles(toPublicTicket(meta, comments, activity), getDownloadUrl);
}

/** 404 whether the ticket is missing OR invisible to this user (no existence leak).
 *  Returns the RAW META item (pk intact) so callers can enrich it. */
async function requireVisibleTicket(db, tables, user, ticketId) {
  const meta = await getMetaItem(db, tables.table, ticketId);
  const ticket = meta ? toPublicTicket(meta) : null;
  if (!ticket || !canViewTicket(ticket, user)) {
    throw httpError(404, 'NOT_FOUND', 'Ticket not found.');
  }
  return meta;
}

async function createTicketItem(db, tables, user, body) {
  const checked = validateCreateTicket(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));
  // Optional attachment keys (uploaded before create) must reference the
  // caller's own namespace — never trust client-supplied ownership.
  const keyCheck = validateAttachmentKeys((body || {}).attachmentKeys, user.sub);
  if (!keyCheck.valid) throw httpError(400, 'VALIDATION_ERROR', keyCheck.errors.join(' '));

  const now = new Date().toISOString();
  const id = randomUUID();
  const meta = {
    pk: pkFor(id),
    sk: 'META',
    title: checked.value.title,
    description: checked.value.description,
    priority: checked.value.priority,
    category: checked.value.category,
    status: 'Open',
    createdBy: user.sub,
    createdByEmail: user.email,
    assignee: 'Unassigned',
    assigneeId: null,
    attachmentKeys: keyCheck.value,
    createdAt: now,
    updatedAt: now
  };
  const created = {
    pk: pkFor(id),
    sk: `ACTIVITY#${now}#${randomUUID()}`,
    type: 'CREATED',
    actorId: user.sub,
    detail: 'Ticket created',
    createdAt: now
  };
  await db.send(new PutCommand({ TableName: tables.table, Item: meta }));
  await db.send(new PutCommand({ TableName: tables.table, Item: created }));
  const activity = [{ type: 'CREATED', actorId: user.sub, detail: 'Ticket created', createdAt: now }];
  return attachFiles(toPublicTicket(meta, [], activity), null);
}

async function listTicketItems(db, tables, user, query = {}, getDownloadUrl) {
  // Queue/list views need META summaries only. Agents see all META rows; a
  // customer is scoped to their own tickets by scopeTicketsToUser(). Loading
  // comments/activity here caused N+1 DynamoDB queries and repeated dashboard
  // 500s. Full enrichment stays on GET /tickets/{ticketId}.
  const out = await db.send(new ScanCommand({
    TableName: tables.table,
    FilterExpression: 'sk = :meta',
    ExpressionAttributeValues: { ':meta': 'META' }
  }));
  const metas = out.Items || [];
  const asPublic = metas.map((m) => toPublicTicket(m));
  const visible = scopeTicketsToUser(asPublic, user);
  const tickets = filterTickets(visible, query);
  return { tickets, count: tickets.length };
}

async function updateTicketItem(db, tables, user, ticketId, body) {
  if (!user || user.role !== 'Agent') {
    throw httpError(user ? 403 : 401, user ? 'FORBIDDEN' : 'UNAUTHORIZED',
      user ? 'Agent role is required.' : 'Valid authentication is required.');
  }
  const checked = validateUpdateTicket(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const meta = await getMetaItem(db, tables.table, ticketId);
  if (!meta) throw httpError(404, 'NOT_FOUND', 'Ticket not found.');

  const { status, priority } = body || {};
  const { value: effectiveAssignee, key: assigneeKey } = pickAssignee(body || {});
  const now = new Date().toISOString();
  const activities = [];

  if (status && status !== meta.status) {
    activities.push({ pk: meta.pk, sk: `ACTIVITY#${now}#${randomUUID()}`, type: 'STATUS_CHANGED', actorId: user.sub, detail: `Status changed to ${status}`, createdAt: now });
    meta.status = status;
  }
  if (effectiveAssignee && effectiveAssignee !== meta.assignee) {
    activities.push({ pk: meta.pk, sk: `ACTIVITY#${now}#${randomUUID()}`, type: 'ASSIGNED', actorId: user.sub, detail: `Assigned to ${effectiveAssignee}`, createdAt: now });
    meta.assignee = effectiveAssignee;
    if (assigneeKey === 'assigneeId') meta.assigneeId = effectiveAssignee;
  }
  if (priority) meta.priority = priority;
  meta.updatedAt = now;

  await db.send(new PutCommand({ TableName: tables.table, Item: meta }));
  for (const item of activities) {
    await db.send(new PutCommand({ TableName: tables.table, Item: item }));
  }
  return withComments(db, tables.table, meta);
}

async function addCommentItem(db, tables, user, ticketId, body) {
  const checked = validateComment(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const ticket = toPublicTicket(await requireVisibleTicket(db, tables, user, ticketId));
  if (!canAccessComments(ticket, user)) throw httpError(404, 'NOT_FOUND', 'Ticket not found.');

  const now = new Date().toISOString();
  const commentId = randomUUID();
  const comment = {
    pk: pkFor(ticket.ticketId),
    sk: `COMMENT#${now}#${commentId}`,
    ticketId: ticket.ticketId,
    commentId,
    text: checked.value.text,
    authorId: user.sub,
    authorRole: user.role,
    authorEmail: user.email || null,
    createdAt: now
  };
  const activity = {
    pk: pkFor(ticket.ticketId),
    sk: `ACTIVITY#${now}#${randomUUID()}`,
    type: 'COMMENT_ADDED',
    actorId: user.sub,
    detail: 'New comment added',
    createdAt: now
  };
  await db.send(new PutCommand({ TableName: tables.table, Item: comment }));
  await db.send(new PutCommand({ TableName: tables.table, Item: activity }));

  const meta = await getMetaItem(db, tables.table, ticket.ticketId);
  meta.updatedAt = now;
  await db.send(new PutCommand({ TableName: tables.table, Item: meta }));

  return { id: comment.commentId, text: comment.text, authorId: comment.authorId, authorRole: comment.authorRole, authorEmail: comment.authorEmail || null, createdAt: comment.createdAt };
}

async function getTicketItem(db, tables, ticketId) {
  const meta = await getMetaItem(db, tables.table, ticketId);
  return meta ? toPublicTicket(meta) : null;
}

async function listCommentItems(db, tables, ticketId) {
  // Ordered by sk = COMMENT#<iso-time>#<uuid> (ascending = oldest first).
  // Note: ISO timestamps have millisecond resolution; two comments created in
  // the same millisecond fall back to uuid suffix order. PoC-acceptable;
  // sub-ms ordering would need a finer clock or sequence suffix (not approved).
  const items = await queryItems(db, tables.table, ticketId, 'COMMENT#');
  return items.map((c) => ({
    id: c.commentId,
    text: c.text,
    authorId: c.authorId,
    authorRole: c.authorRole,
    authorEmail: c.authorEmail || null,
    createdAt: c.createdAt
  }));
}

module.exports = {
  REQUIRED_TABLE,
  DOWNLOAD_EXPIRY_SECONDS,
  tableFromEnv,
  attachmentsBucket,
  defaultGetSigner,
  pkFor,
  ticketIdFromPk,
  getTicketItem,
  listCommentItems,
  withComments,
  attachFiles,
  requireVisibleTicket,
  createTicketItem,
  listTicketItems,
  updateTicketItem,
  addCommentItem,
  planPresignedUpload
};
