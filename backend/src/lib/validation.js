'use strict';

/**
 * Shared validation + filtering logic.
 * Pure functions only — no Express, no AWS SDK — so they can be unit-tested
 * with the Node built-in test runner and reused by server.js and aws-server.js.
 */

const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const CATEGORIES = [
  'Technical Issue',
  'Access & Accounts',
  'Billing',
  'Account Settings',
  'Other'
];

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 5000;
const COMMENT_MAX = 2000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCreateTicket(body = {}) {
  const errors = [];
  const { title, description, priority, category } = body;

  if (!isNonEmptyString(title)) errors.push('Title is required.');
  else if (title.trim().length > TITLE_MAX) errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);

  if (!isNonEmptyString(description)) errors.push('Description is required.');
  else if (description.trim().length > DESCRIPTION_MAX) {
    errors.push(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
  }

  const selectedPriority = priority || 'Medium';
  if (!PRIORITIES.includes(selectedPriority)) {
    errors.push('Priority must be Low, Medium, or High.');
  }

  if (category !== undefined && category !== null && category !== '') {
    if (!CATEGORIES.includes(category)) errors.push('Invalid category.');
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      title: typeof title === 'string' ? title.trim() : '',
      description: typeof description === 'string' ? description.trim() : '',
      priority: selectedPriority,
      category: category || 'Technical Issue'
    }
  };
}

function validateUpdateTicket(body = {}) {
  const errors = [];
  const { status, assignee, assigneeId, priority } = body;
  const effectiveAssignee = assignee !== undefined ? assignee : assigneeId;

  if (status !== undefined && !STATUSES.includes(status)) errors.push('Invalid status.');
  if (priority !== undefined && !PRIORITIES.includes(priority)) errors.push('Invalid priority.');
  if (effectiveAssignee !== undefined && !isNonEmptyString(effectiveAssignee)) {
    errors.push('Assignee must be a non-empty string when provided.');
  }
  if (status === undefined && effectiveAssignee === undefined && priority === undefined) {
    errors.push('Provide at least one of: status, assignee, priority.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Supplement schema names the field `assigneeId`; the retained two-table schema
 * stores display name `assignee`. Accept either key, normalize to one value.
 */
function pickAssignee(body = {}) {
  if (body.assignee !== undefined) return { value: body.assignee, key: 'assignee' };
  if (body.assigneeId !== undefined) return { value: body.assigneeId, key: 'assigneeId' };
  return { value: undefined, key: null };
}

function validateComment(body = {}) {
  const errors = [];
  const { text } = body;
  if (!isNonEmptyString(text)) errors.push('Comment text is required.');
  else if (text.trim().length > COMMENT_MAX) {
    errors.push(`Comment must be ${COMMENT_MAX} characters or fewer.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    value: { text: typeof text === 'string' ? text.trim() : '' }
  };
}

/**
 * In-memory ticket filtering shared by both servers (keeps behaviour identical).
 * Tickets use shape { id|ticketId, title, description, status, priority }.
 */
function filterTickets(tickets, query = {}) {
  let result = Array.isArray(tickets) ? [...tickets] : [];
  const { status, priority, q } = query;

  if (status) result = result.filter((t) => t.status === status);
  if (priority) result = result.filter((t) => t.priority === priority);
  if (q) {
    const needle = String(q).toLowerCase();
    result = result.filter((t) =>
      (t.title || '').toLowerCase().includes(needle) ||
      (t.description || '').toLowerCase().includes(needle) ||
      (t.id || t.ticketId || '').toLowerCase().includes(needle)
    );
  }
  result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return result;
}

/**
 * Ownership scoping: agents see everything, customers see only their own.
 * Matches tickets by createdBy OR legacy ownerId field.
 */
function scopeTicketsToUser(tickets, user) {
  if (!user) return [];
  if (user.role === 'Agent') return tickets;
  return tickets.filter(
    (t) => (t.createdBy || t.ownerId) === user.sub || (t.createdBy || t.ownerId) === user.email
  );
}

/**
 * Attachment keys supplied at ticket creation. Each key must live under the
 * caller's own namespace (`<prefix>/<userSub>/…`, no traversal, sane length)
 * so a customer cannot claim another user's uploads. At most 5 per ticket.
 */
const MAX_ATTACHMENT_KEYS = 5;

function validateAttachmentKeys(keys, userSub, allowedPrefixes = ['attachments/']) {
  const errors = [];
  if (keys === undefined) return { valid: true, errors, value: [] };
  if (!Array.isArray(keys)) return { valid: false, errors: ['attachmentKeys must be an array.'], value: [] };
  if (keys.length > MAX_ATTACHMENT_KEYS) {
    return { valid: false, errors: [`At most ${MAX_ATTACHMENT_KEYS} attachments per ticket.`], value: [] };
  }
  const clean = [];
  for (const key of keys) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
      errors.push('Each attachment key must be a non-empty string.');
      break;
    }
    const okPrefix = allowedPrefixes.some((p) => key.startsWith(p));
    const rest = key.split('/').slice(1).join('/');
    const owner = key.split('/')[1] || '';
    if (!okPrefix || !rest || rest.includes('..') || owner !== String(userSub)) {
      errors.push('Attachment keys must reference your own uploads.');
      break;
    }
    clean.push(key);
  }
  return { valid: errors.length === 0, errors, value: clean };
}

module.exports = {
  STATUSES,
  PRIORITIES,
  CATEGORIES,
  TITLE_MAX,
  DESCRIPTION_MAX,
  COMMENT_MAX,
  MAX_ATTACHMENT_KEYS,
  validateCreateTicket,
  validateUpdateTicket,
  pickAssignee,
  validateAttachmentKeys,
  validateComment,
  filterTickets,
  scopeTicketsToUser
};
