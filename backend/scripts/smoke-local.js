'use strict';

/**
 * Local end-to-end smoke test — spins backend/server.js with ISOLATED temp
 * data (unless KEEP_DATA=1), exercises all 7 routes + auth + attachments over
 * plain localhost HTTP, prints PASS/FAIL per step, exits nonzero on failure.
 *
 * Usage:  npm run smoke            (temp data, deleted afterwards)
 *         PORT=3001 npm run smoke  (custom port)
 * No AWS calls. No credentials.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP = process.env.KEEP_DATA === '1';
const PORT = Number(process.env.PORT || 3000);

let tmpRoot = null;
if (!KEEP) {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ticketing-smoke-'));
  process.env.DATA_FILE = path.join(tmpRoot, 'tickets.json');
  process.env.UPLOAD_DIR = path.join(tmpRoot, 'uploads');
}
process.env.ALLOW_MOCK_AUTH = 'true';
process.env.PORT = String(PORT);

const app = require('../server');

let base;
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function api(method, p, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${PORT}`;

  try {
    const health = await api('GET', '/health');
    check('health endpoint', health.status === 200 && health.json.mode === 'local-mock', JSON.stringify(health.json));

    const users = await api('GET', '/auth/mock-users');
    check('mock user directory', users.status === 200 && users.json.users.length === 3);

    const anon = await api('GET', '/tickets');
    check('401 without token', anon.status === 401);

    const tA = (await api('POST', '/auth/mock-login', null, { userId: 'customer-a' })).json.token;
    const tB = (await api('POST', '/auth/mock-login', null, { userId: 'customer-b' })).json.token;
    const tAgent = (await api('POST', '/auth/mock-login', null, { userId: 'agent-1' })).json.token;
    check('mock login x3', !!tA && !!tB && !!tAgent);

    const created = await api('POST', '/tickets', tA, { title: 'Smoke printer', description: 'Smoke test ticket', priority: 'High' });
    const id = created.json && created.json.ticket && (created.json.ticket.id || created.json.ticket.ticketId);
    check('create ticket (Open, owner A)', created.status === 201 && created.json.ticket.status === 'Open' && created.json.ticket.createdBy === 'customer-a');

    const bList = await api('GET', '/tickets', tB);
    check('B list excludes A ticket', bList.status === 200 && !bList.json.tickets.some((t) => (t.id || t.ticketId) === id));
    const bGet = await api('GET', `/tickets/${id}`, tB);
    check('B direct access is 404', bGet.status === 404);

    const agentList = await api('GET', `/tickets?q=smoke`, tAgent);
    check('agent sees A ticket + search works', agentList.json.tickets.some((t) => (t.id || t.ticketId) === id));
    const upd = await api('PUT', `/tickets/${id}`, tAgent, { status: 'In Progress', assignee: 'agent-1@example.com' });
    check('agent update persists', upd.status === 200 && upd.json.ticket.status === 'In Progress');

    const custPut = await api('PUT', `/tickets/${id}`, tA, { status: 'Closed' });
    check('customer PUT is 403', custPut.status === 403 && custPut.json.error.code === 'FORBIDDEN');

    await api('POST', `/tickets/${id}/comments`, tA, { text: 'smoke comment A' });
    await api('POST', `/tickets/${id}/comments`, tAgent, { text: 'smoke comment agent' });
    const comments = await api('GET', `/tickets/${id}/comments`, tA);
    check('comments chronological', comments.status === 200 &&
      comments.json.comments.map((c) => c.text).join('|') === 'smoke comment A|smoke comment agent');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pre = await api('POST', '/tickets/presigned-url', tA, { filename: 'smoke.png', contentType: 'image/png', fileSize: png.length });
    check('presigned mock (never S3)', pre.status === 200 && pre.json.mock === true && !String(pre.json.uploadUrl).includes('amazonaws'));
    const putRes = await fetch(`${pre.json.uploadUrl}?ticketId=${id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tA}`, 'Content-Type': 'image/png' }, body: png
    });
    check('local upload + associate', putRes.status === 200);
    const detail = await api('GET', `/tickets/${id}`, tA);
    check('attachment on ticket after reload', detail.json.ticket.attachments.length === 1);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  unexpected error — ${err && err.message}`);
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
