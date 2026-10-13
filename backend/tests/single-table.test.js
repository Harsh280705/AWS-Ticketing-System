'use strict';

// Unit tests for the REQUIRED single-table data-access (tkt-tickets pk/sk).
// In-memory fake keyed by pk|sk. No AWS. This module is not yet wired to the
// handlers — wiring happens in Stage 3 only after the table is approved.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const lib = require('../src/lib/ticketsSingleTable');

class FakeSingleTable {
  constructor() {
    this.items = new Map(); // `${pk}|${sk}` -> item
  }

  async send(cmd) {
    const name = cmd.constructor.name;
    const i = cmd.input;
    if (name === 'PutCommand') {
      this.items.set(`${i.Item.pk}|${i.Item.sk}`, { ...i.Item });
      return {};
    }
    if (name === 'GetCommand') {
      const item = this.items.get(`${i.Key.pk}|${i.Key.sk}`);
      return item ? { Item: { ...item } } : {};
    }
    if (name === 'ScanCommand') {
      let all = [...this.items.values()].map((x) => ({ ...x }));
      if (i.FilterExpression === 'sk = :meta') all = all.filter((x) => x.sk === i.ExpressionAttributeValues[':meta']);
      return { Items: all };
    }
    if (name === 'QueryCommand') {
      const { ':pk': pk, ':prefix': prefix } = i.ExpressionAttributeValues;
      const list = [...this.items.values()]
        .filter((x) => x.pk === pk && x.sk.startsWith(prefix))
        .map((x) => ({ ...x }));
      list.sort((a, b) => (i.ScanIndexForward === false
        ? (b.sk || '').localeCompare(a.sk || '')
        : (a.sk || '').localeCompare(b.sk || '')));
      return { Items: list };
    }
    throw new Error(`FakeSingleTable: unsupported ${name}`);
  }
}

const tables = { table: 'tkt-tickets' };
const A = { sub: 'cust-A', email: 'a@example.com', role: 'Customer', groups: [] };
const B = { sub: 'cust-B', email: 'b@example.com', role: 'Customer', groups: [] };
const AGENT = { sub: 'agent-1', email: 'agent@example.com', role: 'Agent', groups: ['Agent'] };

let db;
let idA;

beforeEach(async () => {
  db = new FakeSingleTable();
  const t = await lib.createTicketItem(db, tables, A, { title: 'Printer jam', description: 'Floor 3', priority: 'High' });
  idA = t.ticketId;
  const raw = db.items.get(`TICKET#${idA}|META`);
  assert.ok(raw, 'META item stored under TICKET#<id>');
});

describe('single-table ticket lifecycle', () => {
  it('creates META + CREATED activity with required attributes', async () => {
    const stored = [...db.items.values()];
    assert.ok(stored.some((x) => x.sk === 'META' && x.status === 'Open' && x.createdBy === 'cust-A'));
    const act = stored.find((x) => x.sk.startsWith('ACTIVITY#'));
    assert.equal(act.type, 'CREATED');
    assert.equal(act.actorId, 'cust-A');
  });

  it('scopes lists by owner; agent sees all; filters apply', async () => {
    await lib.createTicketItem(db, tables, B, { title: 'VPN', description: 'Need VPN', priority: 'Low' });
    assert.equal((await lib.listTicketItems(db, tables, B, {})).count, 1);
    assert.equal((await lib.listTicketItems(db, tables, AGENT, {})).count, 2);
    const high = await lib.listTicketItems(db, tables, AGENT, { priority: 'High' });
    assert.ok(high.tickets.every((t) => t.priority === 'High'));
    const q = await lib.listTicketItems(db, tables, AGENT, { q: 'vpn' });
    assert.equal(q.count, 1);
  });

  it('denies cross-customer reads with 404 and allows agent', async () => {
    await assert.rejects(lib.requireVisibleTicket(db, tables, B, idA), (e) => e.status === 404 && e.code === 'NOT_FOUND');
    const meta = await lib.requireVisibleTicket(db, tables, AGENT, idA);
    assert.equal(lib.ticketIdFromPk(meta.pk), idA);
  });

  it('agent update persists status/assigneeId with actor activity', async () => {
    const upd = await lib.updateTicketItem(db, tables, AGENT, idA, { status: 'Resolved', assigneeId: 'agent-1' });
    assert.equal(upd.status, 'Resolved');
    assert.equal(upd.assignee, 'agent-1');
    assert.equal(upd.assigneeId, 'agent-1');
    assert.ok(upd.activity.some((a) => a.type === 'STATUS_CHANGED' && a.actorId === 'agent-1'));
    await assert.rejects(lib.updateTicketItem(db, tables, A, idA, { status: 'Closed' }), (e) => e.status === 403);
  });

  it('comments store as COMMENT#time items and list oldest-first', async () => {
    await lib.addCommentItem(db, tables, A, idA, { text: 'first' });
    await new Promise((r) => setTimeout(r, 5)); // distinct ISO-ms timestamps
    await lib.addCommentItem(db, tables, AGENT, idA, { text: 'second' });
    const list = await lib.listCommentItems(db, tables, idA);
    assert.deepEqual(list.map((c) => c.text), ['first', 'second']);
    assert.deepEqual(list.map((c) => c.authorId), ['cust-A', 'agent-1']);
    await assert.rejects(lib.addCommentItem(db, tables, B, idA, { text: 'snoop' }), (e) => e.status === 404);
  });

  it('stores user-scoped attachment keys at create; rejects foreign keys', async () => {
    const t = await lib.createTicketItem(db, tables, A, {
      title: 'With file', description: 'Has attachment', attachmentKeys: ['attachments/cust-A/a356676d-5643-4ea1-926d-44a6e4368c83-f.png']
    });
    assert.deepEqual(t.attachmentKeys, ['attachments/cust-A/a356676d-5643-4ea1-926d-44a6e4368c83-f.png']);
    assert.equal(t.attachments[0].filename, 'f.png');
    await assert.rejects(
      lib.createTicketItem(db, tables, A, { title: 'X', description: 'Y', attachmentKeys: ['attachments/cust-B/u-f.png'] }),
      (e) => e.status === 400
    );
  });

  it('rejects invalid input with 400', async () => {
    await assert.rejects(lib.createTicketItem(db, tables, A, { title: '', description: 'x' }), (e) => e.status === 400);
    await assert.rejects(lib.updateTicketItem(db, tables, AGENT, idA, { status: 'Done' }), (e) => e.status === 400);
    await assert.rejects(lib.updateTicketItem(db, tables, AGENT, 'missing', { status: 'Closed' }), (e) => e.status === 404);
  });

  it('resolves the table name with TABLE_NAME first (deployment contract)', async () => {
    const prev = { TABLE_NAME: process.env.TABLE_NAME, TICKETS_TABLE: process.env.TICKETS_TABLE };
    try {
      delete process.env.TABLE_NAME;
      delete process.env.TICKETS_TABLE;
      assert.equal(lib.tableFromEnv().table, 'tkt-tickets');
      process.env.TICKETS_TABLE = 'other';
      assert.equal(lib.tableFromEnv().table, 'other');
      process.env.TABLE_NAME = 'tkt-tickets';
      assert.equal(lib.tableFromEnv().table, 'tkt-tickets');
    } finally {
      if (prev.TABLE_NAME === undefined) delete process.env.TABLE_NAME; else process.env.TABLE_NAME = prev.TABLE_NAME;
      if (prev.TICKETS_TABLE === undefined) delete process.env.TICKETS_TABLE; else process.env.TICKETS_TABLE = prev.TICKETS_TABLE;
    }
  });
});
