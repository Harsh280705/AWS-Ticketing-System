'use strict';

/**
 * Shared DynamoDB data-access for tickets + comments.
 * Retained two-table schema (see docs/ARCHITECTURE.md):
 *   Tickets        PK ticketId (S)             — ticket META incl. embedded activity[]
 *   TicketComments PK ticketId (S), SK commentId (S) — chronological via Query
 *
 * Supplement attribute mapping:
 *   title/description/priority/category/status/createdBy/attachmentKeys/
 *   createdAt/updatedAt          → stored as-is on the ticket item
 *   assigneeId (spec)            → accepted on input, normalized to `assignee`
 *                                  (display) and persisted as `assigneeId` too
 *   activity {type, actorId, detail, createdAt} → embedded ticket.activity[]
 *   comment  {text, authorId, authorRole, createdAt} → TicketComments item
 *   pk/sk single-table pattern  → NOT used; ticketId/commentId keys are the
 *                                  equivalent (no migration, per approval)
 *
 * Every function takes an injected `db` ({ send(cmd) }) so unit tests use an
 * in-memory fake and never touch AWS. Coded errors via httpError().
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
  validateComment,
  filterTickets,
  scopeTicketsToUser
} = require('./validation');
const { validatePresignedRequest, buildUploadKey } = require('./uploads');
const { httpError } = require('./response');

function tablesFromEnv(env = process.env) {
  return {
    tickets: env.TICKETS_TABLE || 'Tickets',
    comments: env.COMMENTS_TABLE || 'TicketComments'
  };
}

async function getTicketItem(db, tables, ticketId) {
  const out = await db.send(new GetCommand({ TableName: tables.tickets, Key: { ticketId } }));
  return out.Item || null;
}

async function listCommentItems(db, tables, ticketId) {
  const out = await db.send(new QueryCommand({
    TableName: tables.comments,
    KeyConditionExpression: 'ticketId = :id',
    ExpressionAttributeValues: { ':id': ticketId },
    ScanIndexForward: true
  }));
  return (out.Items || []).map((item) => ({
    id: item.commentId,
    text: item.text,
    authorId: item.authorId,
    authorRole: item.authorRole,
    createdAt: item.createdAt
  }));
}

async function withComments(db, tables, ticket) {
  if (!ticket) return null;
  return { ...ticket, comments: await listCommentItems(db, tables, ticket.ticketId) };
}

/** 404 whether the ticket is missing OR invisible to this user (no existence leak). */
async function requireVisibleTicket(db, tables, user, ticketId) {
  const ticket = await getTicketItem(db, tables, ticketId);
  if (!ticket || !canViewTicket(ticket, user)) {
    throw httpError(404, 'NOT_FOUND', 'Ticket not found.');
  }
  return ticket;
}

async function createTicketItem(db, tables, user, body) {
  const checked = validateCreateTicket(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));

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
    createdBy: user.sub,
    createdByEmail: user.email,
    assignee: 'Unassigned',
    attachmentKeys: [],
    createdAt: now,
    updatedAt: now,
    activity: [{ type: 'CREATED', actorId: user.sub, detail: 'Ticket created', createdAt: now }]
  };
  await db.send(new PutCommand({ TableName: tables.tickets, Item: ticket }));
  return { ...ticket, comments: [] };
}

async function listTicketItems(db, tables, user, query = {}) {
  const out = await db.send(new ScanCommand({ TableName: tables.tickets }));
  const owned = scopeTicketsToUser(out.Items || [], user);
  const tickets = filterTickets(owned, query);
  const enriched = await Promise.all(tickets.map((t) => withComments(db, tables, t)));
  return { tickets: enriched, count: enriched.length };
}

async function updateTicketItem(db, tables, user, ticketId, body) {
  if (!user || user.role !== 'Agent') {
    throw httpError(user ? 403 : 401, user ? 'FORBIDDEN' : 'UNAUTHORIZED',
      user ? 'Agent role is required.' : 'Valid authentication is required.');
  }
  const checked = validateUpdateTicket(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const ticket = await getTicketItem(db, tables, ticketId);
  if (!ticket) throw httpError(404, 'NOT_FOUND', 'Ticket not found.');

  const { status, priority } = body || {};
  const { value: effectiveAssignee, key: assigneeKey } = pickAssignee(body || {});
  const now = new Date().toISOString();
  ticket.activity = ticket.activity || [];

  if (status && status !== ticket.status) {
    ticket.activity.push({ type: 'STATUS_CHANGED', actorId: user.sub, detail: `Status changed to ${status}`, createdAt: now });
    ticket.status = status;
  }
  if (effectiveAssignee && effectiveAssignee !== ticket.assignee) {
    ticket.activity.push({ type: 'ASSIGNED', actorId: user.sub, detail: `Assigned to ${effectiveAssignee}`, createdAt: now });
    ticket.assignee = effectiveAssignee;
    if (assigneeKey === 'assigneeId') ticket.assigneeId = effectiveAssignee;
  }
  if (priority) ticket.priority = priority;
  ticket.updatedAt = now;

  await db.send(new PutCommand({ TableName: tables.tickets, Item: ticket }));
  return withComments(db, tables, ticket);
}

async function addCommentItem(db, tables, user, ticketId, body) {
  const checked = validateComment(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));

  const ticket = await requireVisibleTicket(db, tables, user, ticketId);
  if (!canAccessComments(ticket, user)) throw httpError(404, 'NOT_FOUND', 'Ticket not found.');

  const now = new Date().toISOString();
  const commentId = randomUUID();
  const comment = {
    ticketId: ticket.ticketId,
    commentId,
    text: checked.value.text,
    authorId: user.sub,
    authorRole: user.role,
    createdAt: now
  };
  await db.send(new PutCommand({ TableName: tables.comments, Item: comment }));

  ticket.activity = ticket.activity || [];
  ticket.activity.push({ type: 'COMMENT_ADDED', actorId: user.sub, detail: 'New comment added', createdAt: now });
  ticket.updatedAt = now;
  await db.send(new PutCommand({ TableName: tables.tickets, Item: ticket }));

  return { id: comment.commentId, text: comment.text, authorId: comment.authorId, authorRole: comment.authorRole, createdAt: comment.createdAt };
}

/**
 * Pure upload planning (no S3 call): validates input and returns the
 * user-scoped key `attachments/<userSub>/…`. The handler signs it only when
 * ATTACHMENTS_BUCKET is configured (Stage C); otherwise it answers 501.
 */
function planPresignedUpload(user, body) {
  const checked = validatePresignedRequest(body || {});
  if (!checked.valid) throw httpError(400, 'VALIDATION_ERROR', checked.errors.join(' '));
  return {
    key: buildUploadKey({ userSub: user.sub, filename: checked.value.filename }),
    contentType: checked.value.contentType
  };
}

module.exports = {
  tablesFromEnv,
  getTicketItem,
  listCommentItems,
  withComments,
  requireVisibleTicket,
  createTicketItem,
  listTicketItems,
  updateTicketItem,
  addCommentItem,
  planPresignedUpload
};
