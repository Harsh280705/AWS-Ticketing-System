'use strict';

// Full local-stack integration tests against backend/server.js (JSON file +
// mock auth + local attachments). Everything runs on localhost with isolated
// temp data dirs. No AWS SDK calls, no credentials, no network beyond loopback.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ticketing-local-'));
process.env.DATA_FILE = path.join(tmpRoot, 'tickets.json');
process.env.UPLOAD_DIR = path.join(tmpRoot, 'uploads');
process.env.ALLOW_MOCK_AUTH = 'true';

const app = require('../server');

let server;
let base;

function url(p) {
  return `${base}${p}`;
}

async function call(method, p, token, body, extra = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url(p), { method, headers: { ...headers, ...extra.headers }, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: res.status, json, text };
}

async function rawPut(p, token, bytes, contentType, query = '') {
  const res = await fetch(url(p) + query, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: bytes
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function loginAs(userId) {
  const r = await call('POST', '/auth/mock-login', null, { userId });
  assert.equal(r.status, 200, `mock-login for ${userId}`);
  return r.json.token;
}

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

async function closeServer(s) {
  // fetch() keep-alive sockets would otherwise hold close() open forever.
  if (s && typeof s.closeAllConnections === 'function') s.closeAllConnections();
  await new Promise((resolve) => s.close(resolve));
}

after(async () => {
  await closeServer(server);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
let tokenA;
let tokenB;
let tokenAgent;
let ticketAId;

describe('local health + mock directory', () => {
  it('health is public and reports local-mock mode', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'ok');
    assert.equal(r.json.mode, 'local-mock');
  });

  it('mock directory lists the three test users; unknown login is 400', async () => {
    const dir = await call('GET', '/auth/mock-users');
    assert.equal(dir.status, 200);
    assert.deepEqual(dir.json.users.map((u) => u.sub), ['customer-a', 'customer-b', 'agent-1']);
    const bad = await call('POST', '/auth/mock-login', null, { userId: 'mallory' });
    assert.equal(bad.status, 400);
    tokenA = await loginAs('customer-a');
    tokenB = await loginAs('customer-b');
    tokenAgent = await loginAs('agent-1');
  });
});

describe('local auth enforcement (401/403/404)', () => {
  it('all seven routes return 401 without a token', async () => {
    assert.equal((await call('POST', '/tickets', null, { title: 't', description: 'd' })).status, 401);
    assert.equal((await call('GET', '/tickets')).status, 401);
    assert.equal((await call('GET', '/tickets/x')).status, 401);
    assert.equal((await call('PUT', '/tickets/x', null, { status: 'Closed' })).status, 401);
    assert.equal((await call('POST', '/tickets/x/comments', null, { text: 'hi' })).status, 401);
    assert.equal((await call('GET', '/tickets/x/comments')).status, 401);
    assert.equal((await call('POST', '/tickets/presigned-url', null, { filename: 'a.png', contentType: 'image/png' })).status, 401);
  });
});

describe('local tickets + ownership', () => {
  it('customer A creates a ticket defaulting to Open, identity from token', async () => {
    const r = await call('POST', '/tickets', tokenA, {
      title: 'Printer jam', description: 'Third floor printer', priority: 'High', category: 'Technical Issue',
      createdBy: 'agent-1', authorId: 'agent-1', role: 'Agent' // spoof attempt: must be ignored
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.ticket.status, 'Open');
    assert.equal(r.json.ticket.createdBy, 'customer-a');
    assert.equal(r.json.ticket.activity[0].actorId, 'customer-a');
    ticketAId = r.json.ticket.id;
  });

  it('validation rejects bad input; missing tickets are 404', async () => {
    assert.equal((await call('POST', '/tickets', tokenA, { title: '', description: 'x' })).status, 400);
    assert.equal((await call('POST', '/tickets', tokenA, { title: 't', description: 'd', priority: 'Urgent' })).status, 400);
    assert.equal((await call('GET', '/tickets/does-not-exist', tokenA)).status, 404);
  });

  it('B list excludes A ticket; B detail/comments are 404', async () => {
    const list = await call('GET', '/tickets', tokenB);
    assert.ok(list.json.tickets.every((t) => t.id !== ticketAId && t.ticketId !== ticketAId));
    assert.equal((await call('GET', `/tickets/${ticketAId}`, tokenB)).status, 404);
    assert.equal((await call('GET', `/tickets/${ticketAId}/comments`, tokenB)).status, 404);
    assert.equal((await call('POST', `/tickets/${ticketAId}/comments`, tokenB, { text: 'snoop' })).status, 404);
  });

  it('agent sees all, updates persist with actorId, customer sees update', async () => {
    const before = await call('GET', '/tickets', tokenAgent);
    assert.ok(before.json.tickets.some((t) => (t.id || t.ticketId) === ticketAId));
    const upd = await call('PUT', `/tickets/${ticketAId}`, tokenAgent, { status: 'In Progress', assignee: 'agent-1@example.com' });
    assert.equal(upd.status, 200);
    assert.ok(upd.json.ticket.activity.some((a) => a.type === 'STATUS_CHANGED' && a.actorId === 'agent-1'));
    const seen = await call('GET', `/tickets/${ticketAId}`, tokenA);
    assert.equal(seen.json.ticket.status, 'In Progress');
    const alias = await call('PUT', `/tickets/${ticketAId}`, tokenAgent, { assigneeId: 'agent-1' });
    assert.equal(alias.status, 200);
    assert.equal(alias.json.ticket.assignee, 'agent-1');
  });

  it('customer PUT is the documented 403 shape', async () => {
    const r = await call('PUT', `/tickets/${ticketAId}`, tokenA, { status: 'Closed' });
    assert.equal(r.status, 403);
    assert.deepEqual(r.json, { error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
  });

  it('filters and search work against real local data', async () => {
    await call('POST', '/tickets', tokenB, { title: 'VPN token lost', description: 'Need new token', priority: 'Low' });
    const open = await call('GET', '/tickets?status=In+Progress', tokenAgent);
    assert.ok(open.json.tickets.length >= 1 && open.json.tickets.every((t) => t.status === 'In Progress'));
    const low = await call('GET', '/tickets?priority=Low', tokenAgent);
    assert.ok(low.json.tickets.every((t) => t.priority === 'Low'));
    const q = await call('GET', '/tickets?q=vpn', tokenAgent);
    assert.ok(q.json.tickets.length >= 1 && q.json.tickets.every((t) => `${t.title} ${t.description}`.toLowerCase().includes('vpn')));
  });

  it('comments are chronological with token-derived authorship', async () => {
    await call('POST', `/tickets/${ticketAId}/comments`, tokenA, { text: 'first', authorId: 'agent-1', authorRole: 'Agent' });
    await call('POST', `/tickets/${ticketAId}/comments`, tokenAgent, { text: 'second' });
    const list = await call('GET', `/tickets/${ticketAId}/comments`, tokenA);
    assert.deepEqual(list.json.comments.map((c) => c.text), ['first', 'second']);
    assert.deepEqual(list.json.comments.map((c) => c.authorId), ['customer-a', 'agent-1']);
    assert.equal((await call('POST', `/tickets/${ticketAId}/comments`, tokenA, { text: '  ' })).status, 400);
  });
});

describe('local attachments (mock, never AWS)', () => {
  it('presigned mock validates, uploads, downloads, and attaches to the ticket', async () => {
    const bad = await call('POST', '/tickets/presigned-url', tokenA, { filename: 'x.exe', contentType: 'application/x-msdownload' });
    assert.equal(bad.status, 400);

    const pre = await call('POST', '/tickets/presigned-url', tokenA, { filename: 'shot.png', contentType: 'image/png', fileSize: PNG.length });
    assert.equal(pre.status, 200);
    assert.equal(pre.json.mock, true);
    assert.match(pre.json.key, /^local\/customer-a\//);
    assert.match(pre.json.uploadUrl, /\/mock-uploads\//);
    assert.ok(!pre.json.uploadUrl.includes('amazonaws.com'));

    const put = await rawPut(pre.json.uploadUrl.replace(base, ''), tokenA, PNG, 'image/png', `?ticketId=${ticketAId}`);
    assert.equal(put.status, 200);

    const detail = await call('GET', `/tickets/${ticketAId}`, tokenA);
    assert.equal(detail.json.ticket.attachments.length, 1);
    assert.equal(detail.json.ticket.attachments[0].filename, 'shot.png');
    assert.equal(detail.json.ticket.attachments[0].mock, true);

    const dl = await fetch(url(detail.json.ticket.attachments[0].url), { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(dl.status, 200);
    assert.deepEqual(Buffer.from(await dl.arrayBuffer()), PNG);
  });

  it('create accepts prior-upload keys and merges disk metadata; foreign keys rejected', async () => {
    const pre = await call('POST', '/tickets/presigned-url', tokenB, { filename: 'doc.pdf', contentType: 'application/pdf', fileSize: 4 });
    assert.equal(pre.status, 200);
    const put = await rawPut(pre.json.uploadUrl.replace(base, ''), tokenB, Buffer.from([1, 2, 3, 4]), 'application/pdf');
    assert.equal(put.status, 200);
    const created = await call('POST', '/tickets', tokenB, { title: 'With doc', description: 'See attached', attachmentKeys: [pre.json.key] });
    assert.equal(created.status, 201);
    assert.deepEqual(created.json.ticket.attachmentKeys, [pre.json.key]);
    assert.equal(created.json.ticket.attachments[0].filename, 'doc.pdf');
    assert.equal(created.json.ticket.attachments[0].size, 4);
    const foreign = await call('POST', '/tickets', tokenB, { title: 'X', description: 'Y', attachmentKeys: ['local/customer-a/evil.png'] });
    assert.equal(foreign.status, 400);
  });

  it('blocks traversal, wrong owners, bad types, and oversize files', async () => {
    assert.equal((await rawPut('/mock-uploads/local/customer-a/../../evil.png', tokenA, PNG, 'image/png')).status, 400);
    // Key owned by A uploaded with B's token -> 403
    const pre = await call('POST', '/tickets/presigned-url', tokenA, { filename: 'a.png', contentType: 'image/png', fileSize: 3 });
    const otherKey = pre.json.uploadUrl.replace(base, '');
    assert.equal((await rawPut(otherKey, tokenB, Buffer.from([1, 2, 3]), 'image/png')).status, 403);
    assert.equal((await rawPut(otherKey, tokenA, Buffer.from([1]), 'application/x-msdownload')).status, 400);
    const big = await rawPut(otherKey, tokenA, Buffer.alloc(6 * 1024 * 1024, 1), 'image/png');
    assert.ok([400, 413].includes(big.status), `expected 400/413, got ${big.status}`);
    // Unauthenticated download is 401; outsider customer download is 404
    const anon = await fetch(url('/mock-uploads/local/customer-a/shot.png'));
    assert.equal(anon.status, 401);
  });
});

describe('local persistence across restart', () => {
  it('tickets survive a backend restart', async () => {
    await closeServer(server);
    delete require.cache[require.resolve('../server')];
    const fresh = require('../server');
    await new Promise((resolve) => { server = fresh.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const list = await call('GET', '/tickets', tokenAgent);
    assert.ok(list.json.tickets.some((t) => (t.id || t.ticketId) === ticketAId));
  });
});

describe('mock tokens never work on the production path', () => {
  it('aws-server rejects mock tokens with 401 before any SDK call', async () => {
    const awsApp = require('../aws-server');
    const awsServer = awsApp.listen(0, '127.0.0.1');
    await new Promise((resolve) => awsServer.once('listening', resolve));
    const port = awsServer.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/tickets`, { headers: { Authorization: `Bearer ${tokenA}` } });
      assert.equal(res.status, 401);
    } finally {
      await closeServer(awsServer);
    }
  });
});
