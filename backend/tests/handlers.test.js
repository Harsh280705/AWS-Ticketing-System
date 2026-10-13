'use strict';

// End-to-end acceptance coverage for the seven tkt-* handlers against the
// REQUIRED single-table schema (tkt-tickets pk/sk), via an in-memory fake.
// No network, no AWS credentials, no charges.
// Maps to PDF §12 items 2–9 (item 1 needs the live Hosted UI).

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { buildHandler: createTicket } = require('../src/handlers/createTicket');
const { buildHandler: listTickets } = require('../src/handlers/listTickets');
const { buildHandler: getTicket } = require('../src/handlers/getTicket');
const { buildHandler: updateTicket } = require('../src/handlers/updateTicket');
const { buildHandler: addComment } = require('../src/handlers/addComment');
const { buildHandler: listComments } = require('../src/handlers/listComments');
const { buildHandler: presignedUrl } = require('../src/handlers/presignedUrl');

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
      list.sort((a, b) => (a.sk || '').localeCompare(b.sk || ''));
      return { Items: list };
    }
    throw new Error(`FakeSingleTable: unsupported ${name}`);
  }
}

const claimsA = { sub: 'cust-A', email: 'a@example.com', 'cognito:groups': [] };
const claimsB = { sub: 'cust-B', email: 'b@example.com', 'cognito:groups': [] };
const claimsAgent = { sub: 'agent-1', email: 'agent@example.com', 'cognito:groups': ['Agent'] };

function evt({ claims, params, query, body, rawBody }) {
  return {
    requestContext: claims === undefined ? {} : { authorizer: { jwt: { claims } } },
    pathParameters: params || null,
    queryStringParameters: query || null,
    body: rawBody !== undefined ? rawBody : body === undefined ? null : JSON.stringify(body),
    headers: {}
  };
}

function json(res) {
  return JSON.parse(res.body);
}

let db;
let h;
let ticketAId;
let ticketBId;

beforeEach(async () => {
  db = new FakeSingleTable();
  h = {
    create: createTicket(db),
    list: listTickets(db),
    get: getTicket(db),
    update: updateTicket(db),
    addComment: addComment(db),
    comments: listComments(db),
    presigned: presignedUrl(db)
  };
  delete process.env.ATTACHMENTS_BUCKET;
  delete process.env.BUCKET_NAME;

  const a = json(await h.create(evt({ claims: claimsA, body: { title: 'A printer jam', description: 'Office printer jams', priority: 'High' } })));
  ticketAId = a.ticket.ticketId;
  const b = json(await h.create(evt({ claims: claimsB, body: { title: 'B vpn access', description: 'Need VPN', priority: 'Low' } })));
  ticketBId = b.ticket.ticketId;
});

describe('acceptance: create + list isolation (single-table)', () => {
  it('Customer A creates a ticket with status Open and own sub (item 2)', async () => {
    const res = await h.create(evt({ claims: claimsA, body: { title: 'New issue', description: 'Details here' } }));
    assert.equal(res.statusCode, 201);
    const t = json(res).ticket;
    assert.equal(t.status, 'Open');
    assert.equal(t.createdBy, 'cust-A');
    assert.equal(t.activity[0].actorId, 'cust-A');
    assert.ok(db.items.has(`TICKET#${t.ticketId}|META`));
  });

  it('Customer B list excludes A ticket; direct get is documented 404 (item 3)', async () => {
    const list = json(await h.list(evt({ claims: claimsB })));
    assert.ok(list.tickets.every((t) => t.ticketId !== ticketAId));
    const get = await h.get(evt({ claims: claimsB, params: { ticketId: ticketAId } }));
    assert.equal(get.statusCode, 404);
    assert.equal(json(get).error.code, 'NOT_FOUND');
  });

  it('Agent sees both customers tickets (item 4)', async () => {
    const list = json(await h.list(evt({ claims: claimsAgent })));
    const ids = list.tickets.map((t) => t.ticketId);
    assert.ok(ids.includes(ticketAId) && ids.includes(ticketBId));
  });
});

describe('acceptance: filters, agent update, comments (single-table)', () => {
  it('status/priority/q filters return only matches (item 5)', async () => {
    const byStatus = json(await h.list(evt({ claims: claimsAgent, query: { status: 'Open' } })));
    assert.ok(byStatus.tickets.length >= 2);
    const byPriority = json(await h.list(evt({ claims: claimsAgent, query: { priority: 'High' } })));
    assert.ok(byPriority.tickets.length >= 1 && byPriority.tickets.every((t) => t.priority === 'High'));
    const byQ = json(await h.list(evt({ claims: claimsAgent, query: { q: 'vpn' } })));
    assert.deepEqual(byQ.tickets.map((t) => t.ticketId), [ticketBId]);
  });

  it('Agent update persists, records activity with actorId, customer sees it (item 6)', async () => {
    const upd = await h.update(evt({
      claims: claimsAgent, params: { ticketId: ticketAId }, body: { status: 'In Progress', assignee: 'agent@example.com' }
    }));
    assert.equal(upd.statusCode, 200);
    const changed = json(upd).ticket;
    assert.equal(changed.status, 'In Progress');
    const act = changed.activity.find((x) => x.type === 'STATUS_CHANGED');
    assert.equal(act.actorId, 'agent-1');

    const seen = json(await h.get(evt({ claims: claimsA, params: { ticketId: ticketAId } })));
    assert.equal(seen.ticket.status, 'In Progress');
    assert.equal(seen.ticket.assignee, 'agent@example.com');
  });

  it('assigneeId alias is accepted and persisted', async () => {
    const upd = await h.update(evt({
      claims: claimsAgent, params: { ticketId: ticketAId }, body: { assigneeId: 'agent-1' }
    }));
    assert.equal(upd.statusCode, 200);
    assert.equal(json(upd).ticket.assignee, 'agent-1');
  });

  it('owner and agent comments appear oldest-first; outsider gets 404 (item 7)', async () => {
    await h.addComment(evt({ claims: claimsA, params: { ticketId: ticketAId }, body: { text: 'first from A' } }));
    await new Promise((r) => setTimeout(r, 5)); // distinct ISO-ms timestamps
    await h.addComment(evt({ claims: claimsAgent, params: { ticketId: ticketAId }, body: { text: 'second from agent' } }));
    const list = json(await h.comments(evt({ claims: claimsA, params: { ticketId: ticketAId } })));
    assert.deepEqual(list.comments.map((c) => c.text), ['first from A', 'second from agent']);
    const denied = await h.addComment(evt({ claims: claimsB, params: { ticketId: ticketAId }, body: { text: 'nope' } }));
    assert.equal(denied.statusCode, 404);
  });
});

describe('acceptance: presigned uploads + auth errors (items 8–9)', () => {
  it('invalid upload input is 400 without touching S3', async () => {
    const res = await h.presigned(evt({ claims: claimsA, body: { filename: 'evil.exe', contentType: 'application/x-msdownload' } }));
    assert.equal(res.statusCode, 400);
  });

  it('valid input without bucket is 501; key plan is attachments/<sub>/…', async () => {
    const res = await h.presigned(evt({ claims: claimsA, body: { filename: 'shot.png', contentType: 'image/png', fileSize: 100 } }));
    assert.equal(res.statusCode, 501);
    assert.equal(json(res).error.code, 'AWS_NOT_CONFIGURED');

    const { planPresignedUpload } = require('../src/lib/ticketsSingleTable');
    const plan = planPresignedUpload({ sub: 'cust-A', role: 'Customer' }, { filename: 'shot.png', contentType: 'image/png' });
    assert.match(plan.key, /^attachments\/cust-A\//);
  });

  it('missing token is 401 on all seven handlers; customer PUT is 403', async () => {
    for (const fn of [h.create, h.list, h.get, h.update, h.addComment, h.comments, h.presigned]) {
      const res = await fn(evt({ params: { ticketId: ticketAId }, body: {} }));
      assert.equal(res.statusCode, 401, 'expected 401');
    }
    const forbidden = await h.update(evt({ claims: claimsA, params: { ticketId: ticketAId }, body: { status: 'Closed' } }));
    assert.equal(forbidden.statusCode, 403);
    assert.equal(json(forbidden).error.code, 'FORBIDDEN');
  });

  it('stores create-time attachment keys and signs download urls when configured', async () => {
    const createdRes = await h.create(evt({
      claims: claimsA,
      body: { title: 'With file', description: 'D', attachmentKeys: ['attachments/cust-A/a356676d-5643-4ea1-926d-44a6e4368c83-pic.png'] }
    }));
    assert.equal(createdRes.statusCode, 201);
    const created = json(createdRes);
    const unsigned = json(await h.get(evt({ claims: claimsA, params: { ticketId: created.ticket.ticketId } })));
    assert.equal(unsigned.ticket.attachments[0].filename, 'pic.png');
    assert.equal(unsigned.ticket.attachments[0].url, null);

    const { buildHandler: getWithSigner } = require('../src/handlers/getTicket');
    const signed = getWithSigner(db, async (key) => `https://signed.example/${key}`);
    const res = json(await signed(evt({ claims: claimsA, params: { ticketId: created.ticket.ticketId } })));
    assert.equal(res.ticket.attachments[0].url, 'https://signed.example/attachments/cust-A/a356676d-5643-4ea1-926d-44a6e4368c83-pic.png');
  });

  it('invalid JSON body is 400, never 500', async () => {
    const res = await h.create(evt({ claims: claimsA, rawBody: '{oops' }));
    assert.equal(res.statusCode, 400);
  });
});
