'use strict';

// HTTP-level auth tests for the DEPLOYED path (aws-server.js).
// By design these never reach DynamoDB/S3:
// - requests WITHOUT a token are rejected 401 by attachUser before any SDK call;
// - PUT with a Customer token is rejected 403 by requireAgent before any SDK call;
// - presigned-url validation failures return 400 before any S3 call.
// No live AWS requests are made.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../aws-server');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function mockJwt(payload) {
  return `eyJhbGciOiJub25lIn0.${b64url(payload)}.sig`;
}
const customerToken = mockJwt({ sub: 'cust-A', email: 'a@example.com', 'cognito:groups': ['Customer'] });

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

describe('deployed API requires JWT on all seven ticket routes', () => {
  it('health stays public (no ticket data)', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'ok');
  });

  it('401 without token: POST /tickets, GET /tickets, GET /tickets/{id}', async () => {
    assert.equal((await call('POST', '/tickets', null, { title: 'T', description: 'D' })).status, 401);
    assert.equal((await call('GET', '/tickets')).status, 401);
    assert.equal((await call('GET', '/tickets/abc')).status, 401);
  });

  it('401 without token: PUT, both comment routes, presigned-url', async () => {
    assert.equal((await call('PUT', '/tickets/abc', null, { status: 'Closed' })).status, 401);
    assert.equal((await call('POST', '/tickets/abc/comments', null, { text: 'hi' })).status, 401);
    assert.equal((await call('GET', '/tickets/abc/comments')).status, 401);
    assert.equal(
      (await call('POST', '/tickets/presigned-url', null, { filename: 'a.png', contentType: 'image/png' })).status,
      401
    );
  });

  it('403 for Customer on agent-only PUT (rejected before any DB call)', async () => {
    const r = await call('PUT', '/tickets/abc', customerToken, { status: 'Closed' });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
  });

  it('presigned-url validates input before S3 (400 on bad MIME, no AWS call)', async () => {
    const r = await call('POST', '/tickets/presigned-url', customerToken, {
      filename: 'evil.exe',
      contentType: 'application/x-msdownload'
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  });
});
