'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCreateTicket,
  validateUpdateTicket,
  validateComment,
  validateAttachmentKeys,
  filterTickets,
  scopeTicketsToUser,
  STATUSES,
  PRIORITIES
} = require('../src/lib/validation');

describe('attachment key validation (user-scoped)', () => {
  it('accepts own-namespace keys and empty/undefined', () => {
    assert.deepEqual(
      validateAttachmentKeys(['attachments/cust-A/uuid-a.png'], 'cust-A').value,
      ['attachments/cust-A/uuid-a.png']
    );
    assert.equal(validateAttachmentKeys(undefined, 'cust-A').valid, true);
  });

  it('rejects foreign namespaces, traversal, non-arrays, and oversized lists', () => {
    assert.equal(validateAttachmentKeys(['attachments/cust-B/x.png'], 'cust-A').valid, false);
    assert.equal(validateAttachmentKeys(['attachments/cust-A/../x.png'], 'cust-A').valid, false);
    assert.equal(validateAttachmentKeys(['other/cust-A/x.png'], 'cust-A').valid, false);
    assert.equal(validateAttachmentKeys('nope', 'cust-A').valid, false);
    assert.equal(validateAttachmentKeys(new Array(6).fill('attachments/cust-A/x.png'), 'cust-A').valid, false);
  });
});

describe('ticket creation validation', () => {
  it('accepts a valid ticket', () => {
    const r = validateCreateTicket({ title: 'Printer down', description: 'It jams', priority: 'High', category: 'Technical Issue' });
    assert.equal(r.valid, true);
    assert.equal(r.value.priority, 'High');
  });

  it('defaults priority to Medium and category', () => {
    const r = validateCreateTicket({ title: 'T', description: 'D' });
    assert.equal(r.valid, true);
    assert.equal(r.value.priority, 'Medium');
    assert.equal(r.value.category, 'Technical Issue');
  });

  it('rejects missing title/description', () => {
    assert.equal(validateCreateTicket({ title: ' ', description: 'x' }).valid, false);
    assert.equal(validateCreateTicket({ title: 'x', description: '' }).valid, false);
    assert.equal(validateCreateTicket({}).valid, false);
  });

  it('rejects bad priority and bad category', () => {
    assert.equal(validateCreateTicket({ title: 'T', description: 'D', priority: 'Urgent' }).valid, false);
    assert.equal(validateCreateTicket({ title: 'T', description: 'D', category: 'Nope' }).valid, false);
  });

  it('rejects overlong title', () => {
    const r = validateCreateTicket({ title: 'a'.repeat(121), description: 'D' });
    assert.equal(r.valid, false);
  });
});

describe('ticket listing and filters', () => {
  const tickets = [
    { id: 'a1', title: 'Printer jam', description: 'office printer', status: 'Open', priority: 'High', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'b2', title: 'VPN access', description: 'need vpn', status: 'In Progress', priority: 'Low', createdAt: '2026-10-02T00:00:00.000Z' },
    { id: 'c3', title: 'Billing question', description: 'invoice wrong', status: 'Resolved', priority: 'Medium', createdAt: '2026-10-03T00:00:00.000Z' }
  ];

  it('filters by status', () => {
    assert.equal(filterTickets(tickets, { status: 'Open' }).length, 1);
  });

  it('filters by priority', () => {
    assert.equal(filterTickets(tickets, { priority: 'Low' }).length, 1);
  });

  it('searches title, description, and id (case-insensitive)', () => {
    assert.equal(filterTickets(tickets, { q: 'vpn' }).length, 1);
    assert.equal(filterTickets(tickets, { q: 'INVOICE' }).length, 1);
    assert.equal(filterTickets(tickets, { q: 'b2' }).length, 1);
  });

  it('combines filters and sorts newest first', () => {
    const out = filterTickets(tickets, {});
    assert.deepEqual(out.map((t) => t.id), ['c3', 'b2', 'a1']);
  });

  it('exposes the exact required status/priority vocabularies', () => {
    assert.deepEqual(STATUSES, ['Open', 'In Progress', 'Resolved', 'Closed']);
    assert.deepEqual(PRIORITIES, ['Low', 'Medium', 'High']);
  });
});

describe('status and assignment validation', () => {
  it('accepts valid status/priority/assignee combos', () => {
    assert.equal(validateUpdateTicket({ status: 'In Progress' }).valid, true);
    assert.equal(validateUpdateTicket({ assignee: 'agent@example.com' }).valid, true);
    assert.equal(validateUpdateTicket({ priority: 'Low' }).valid, true);
  });

  it('rejects invalid status/priority', () => {
    assert.equal(validateUpdateTicket({ status: 'Done' }).valid, false);
    assert.equal(validateUpdateTicket({ priority: 'Urgent' }).valid, false);
  });

  it('rejects empty update and blank assignee', () => {
    assert.equal(validateUpdateTicket({}).valid, false);
    assert.equal(validateUpdateTicket({ assignee: '  ' }).valid, false);
  });
});

describe('comment creation and listing', () => {
  it('accepts non-empty text and trims', () => {
    const r = validateComment({ text: '  hello  ' });
    assert.equal(r.valid, true);
    assert.equal(r.value.text, 'hello');
  });

  it('rejects missing/blank/overlong text', () => {
    assert.equal(validateComment({}).valid, false);
    assert.equal(validateComment({ text: '   ' }).valid, false);
    assert.equal(validateComment({ text: 'x'.repeat(2001) }).valid, false);
  });
});

describe('customer-vs-agent scoping', () => {
  const tickets = [
    { id: '1', createdBy: 'cust-A' },
    { id: '2', createdBy: 'cust-B' }
  ];

  it('agents see all tickets', () => {
    const out = scopeTicketsToUser(tickets, { sub: 'agent-1', email: null, role: 'Agent', groups: ['Agent'] });
    assert.equal(out.length, 2);
  });

  it('customers see only their own', () => {
    const out = scopeTicketsToUser(tickets, { sub: 'cust-A', email: null, role: 'Customer', groups: [] });
    assert.deepEqual(out.map((t) => t.id), ['1']);
  });
});
