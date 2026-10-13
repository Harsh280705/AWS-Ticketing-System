
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');

const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const { attachUser, requireAgent, canViewTicket, canAccessComments } = require('./src/lib/auth');
const {
  validateCreateTicket,
  validateUpdateTicket,
  pickAssignee,
  validateAttachmentKeys,
  validateComment,
  filterTickets,
  scopeTicketsToUser
} = require('./src/lib/validation');
const { validatePresignedRequest, displayNameFromKey } = require('./src/lib/uploads');

const app = express();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

const db = DynamoDBDocumentClient.from(client);

const TICKETS_TABLE = process.env.TICKETS_TABLE || 'Tickets';
const COMMENTS_TABLE =
  process.env.COMMENTS_TABLE || 'TicketComments';

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

// Public health check (no ticket data). All /tickets* routes require auth below.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ticketing-api',
    storage: 'dynamodb'
  });
});

// JWT claims are verified upstream by the API Gateway Cognito JWT authorizer.
// attachUser enforces 401 when no valid claims are present (defense in depth).
app.use('/tickets', attachUser({ required: true }));

function createError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message }
  });
}

async function getTicket(ticketId) {
  const result = await db.send(new GetCommand({
    TableName: TICKETS_TABLE,
    Key: { ticketId }
  }));

  return result.Item || null;
}

async function getComments(ticketId) {
  const result = await db.send(new QueryCommand({
    TableName: COMMENTS_TABLE,
    KeyConditionExpression: 'ticketId = :id',
    ExpressionAttributeValues: {
      ':id': ticketId
    },
    ScanIndexForward: true
  }));

  return (result.Items || []).map(item => ({
    id: item.commentId,
    text: item.text,
    authorId: item.authorId,
    authorRole: item.authorRole,
    createdAt: item.createdAt
  }));
}

function attachmentsOf(ticket) {
  return (ticket.attachmentKeys || []).map((key) => ({
    key,
    filename: displayNameFromKey(String(key).split('/').pop()),
    url: null
  }));
}

async function getTicketWithComments(ticket) {
  if (!ticket) return null;

  return {
    ...ticket,
    comments: await getComments(ticket.ticketId),
    // Express fallback has no download signer; keys + display names only.
    attachments: attachmentsOf(ticket)
  };
}

// Create a ticket
app.post('/tickets', async (req, res) => {
  const checked = validateCreateTicket(req.body || {});

  if (!checked.valid) {
    return createError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));
  }

  const keyCheck = validateAttachmentKeys((req.body || {}).attachmentKeys, req.user.sub);
  if (!keyCheck.valid) {
    return createError(res, 400, 'VALIDATION_ERROR', keyCheck.errors.join(' '));
  }

  const { title, description, priority, category } = checked.value;
  const now = new Date().toISOString();
  const id = randomUUID();

  const ticket = {
    ticketId: id,
    id,
    title,
    description,
    priority,
    category,
    status: 'Open',
    createdBy: req.user.sub,
    createdByEmail: req.user.email,
    assignee: 'Unassigned',
    attachmentKeys: keyCheck.value,
    createdAt: now,
    updatedAt: now,
    activity: [{
      type: 'CREATED',
      actorId: req.user.sub,
      detail: 'Ticket created',
      createdAt: now
    }]
  };

  await db.send(new PutCommand({
    TableName: TICKETS_TABLE,
    Item: ticket
  }));

  return res.status(201).json({
    ticket: { ...ticket, comments: [], attachments: attachmentsOf(ticket) }
  });
});

// List tickets, with optional filters and search.
// Agents see all tickets; customers see only their own (enforced here, not in UI).
app.get('/tickets', async (req, res) => {
  const result = await db.send(new ScanCommand({
    TableName: TICKETS_TABLE
  }));

  const owned = scopeTicketsToUser(result.Items || [], req.user);
  const tickets = filterTickets(owned, req.query || {});

  const enriched = await Promise.all(
    tickets.map(ticket => getTicketWithComments(ticket))
  );

  return res.json({
    tickets: enriched,
    count: enriched.length
  });
});

// Get ticket details — owner or Agent only. Non-owners get the documented
// not-found response (never confirm or deny another customer's ticket).
app.get('/tickets/:ticketId', async (req, res) => {
  const ticket = await getTicket(req.params.ticketId);

  if (!ticket) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  if (!canViewTicket(ticket, req.user)) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  return res.json({
    ticket: await getTicketWithComments(ticket)
  });
});

// Update ticket status, assignee, or priority — Agent only.
app.put('/tickets/:ticketId', requireAgent, async (req, res) => {
  const checked = validateUpdateTicket(req.body || {});

  if (!checked.valid) {
    return createError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));
  }

  const { status, priority } = req.body;
  const { value: effectiveAssignee, key: assigneeKey } = pickAssignee(req.body || {});

  const ticket = await getTicket(req.params.ticketId);

  if (!ticket) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  const now = new Date().toISOString();
  ticket.activity = ticket.activity || [];

  if (status && status !== ticket.status) {
    ticket.activity.push({
      type: 'STATUS_CHANGED',
      actorId: req.user.sub,
      detail: `Status changed to ${status}`,
      createdAt: now
    });
    ticket.status = status;
  }

  if (effectiveAssignee && effectiveAssignee !== ticket.assignee) {
    ticket.activity.push({
      type: 'ASSIGNED',
      actorId: req.user.sub,
      detail: `Assigned to ${effectiveAssignee}`,
      createdAt: now
    });
    ticket.assignee = effectiveAssignee;
    if (assigneeKey === 'assigneeId') ticket.assigneeId = effectiveAssignee;
  }

  if (priority) ticket.priority = priority;

  ticket.updatedAt = now;

  await db.send(new PutCommand({
    TableName: TICKETS_TABLE,
    Item: ticket
  }));

  return res.json({
    ticket: await getTicketWithComments(ticket)
  });
});

// Add a comment — owner or Agent only; identity comes from JWT claims.
app.post('/tickets/:ticketId/comments', async (req, res) => {
  const checked = validateComment(req.body || {});

  if (!checked.valid) {
    return createError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));
  }

  const ticket = await getTicket(req.params.ticketId);

  if (!ticket) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  if (!canAccessComments(ticket, req.user)) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  const now = new Date().toISOString();
  const commentId = randomUUID();

  const comment = {
    ticketId: ticket.ticketId,
    commentId,
    text: checked.value.text,
    authorId: req.user.sub,
    authorRole: req.user.role,
    createdAt: now
  };

  await db.send(new PutCommand({
    TableName: COMMENTS_TABLE,
    Item: comment
  }));

  ticket.activity = ticket.activity || [];
  ticket.activity.push({
    type: 'COMMENT_ADDED',
    actorId: req.user.sub,
    detail: 'New comment added',
    createdAt: now
  });
  ticket.updatedAt = now;

  await db.send(new PutCommand({
    TableName: TICKETS_TABLE,
    Item: ticket
  }));

  return res.status(201).json({
    comment: {
      id: comment.commentId,
      text: comment.text,
      authorId: comment.authorId,
      authorRole: comment.authorRole,
      createdAt: comment.createdAt
    }
  });
});

// List comments — owner or Agent only, chronological (Query ScanIndexForward).
// Non-owners get the documented not-found response.
app.get('/tickets/:ticketId/comments', async (req, res) => {
  const ticket = await getTicket(req.params.ticketId);

  if (!ticket) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  if (!canAccessComments(ticket, req.user)) {
    return createError(res, 404, 'NOT_FOUND', 'Ticket not found.');
  }

  return res.json({
    comments: await getComments(ticket.ticketId)
  });
});

// Pre-signed S3 upload URL.
// Stage A: validates filename/MIME/size and key namespace without calling S3,
// so unit tests never incur AWS charges. Live getSignedUrl wiring lands in
// Stage C after bucket approval (ATTACHMENTS_BUCKET env).
app.post('/tickets/presigned-url', (req, res) => {
  const checked = validatePresignedRequest(req.body || {});

  if (!checked.valid) {
    return createError(res, 400, 'VALIDATION_ERROR', checked.errors.join(' '));
  }

  if (!process.env.ATTACHMENTS_BUCKET) {
    return createError(
      res, 501, 'AWS_NOT_CONFIGURED',
      'S3 uploads have not been configured yet.'
    );
  }

  // Stage C implements: buildUploadKey({ userSub: req.user.sub, ... }) +
  // getSignedUrl(new PutObjectCommand({ Bucket, Key, ContentType })) with short expiry.
  // Keys are namespaced attachments/<userSub>/… per the supplement.
  return createError(
    res, 501, 'AWS_NOT_CONFIGURED',
    'S3 uploads have not been configured yet.'
  );
});

app.use((err, _req, res, _next) => {
  console.error(err);

  return createError(
    res, 500, 'INTERNAL_ERROR',
    'An unexpected server error occurred.'
  );
});

module.exports = app;
