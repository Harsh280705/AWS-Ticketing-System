'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeJwtPayloadNoVerify,
  getUserFromClaims,
  isAgent,
  canViewTicket,
  canUpdateTicket,
  canAccessComments,
  attachUser,
  requireAgent
} = require('../src/lib/auth');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function mockJwt(payload) {
  return `eyJhbGciOiJub25lIn0.${b64url(payload)}.sig`;
}

describe('auth: missing/invalid authentication', () => {
  it('decode returns null for garbage', () => {
    assert.equal(decodeJwtPayloadNoVerify('not-a-token'), null);
    assert.equal(decodeJwtPayloadNoVerify(null), null);
  });

  it('getUserFromClaims returns null without sub', () => {
    assert.equal(getUserFromClaims(null), null);
    assert.equal(getUserFromClaims({}), null);
  });

  it('attachUser(required:true) returns 401 with no token', () => {
    const mw = attachUser({ required: true });
    let status = 0;
    let body = null;
    const res = { status: (s) => { status = s; return { json: (b) => { body = b; } }; } };
    mw({ headers: {} }, res, () => { throw new Error('next should not be called'); });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('attachUser(required:false) falls back to demo user (local server.js path)', () => {
    const mw = attachUser({ required: false });
    let nexted = false;
    const req = { headers: {} };
    mw(req, {}, () => { nexted = true; });
    assert.equal(nexted, true);
    assert.equal(req.user.sub, 'local-demo-user');
    assert.equal(req.user.demo, true);
  });

  it('requireAgent returns 401 without user and 403 for customers', () => {
    let status = 0;
    const res = () => ({ status: (s) => { status = s; return { json: () => {} }; } });
    requireAgent({}, res(), () => { throw new Error('nope'); });
    assert.equal(status, 401);
    requireAgent({ user: { role: 'Customer' } }, res(), () => { throw new Error('nope'); });
    assert.equal(status, 403);
    let ok = false;
    requireAgent({ user: { role: 'Agent' } }, res(), () => { ok = true; });
    assert.equal(ok, true);
  });
});

describe('auth: roles come from cognito:groups, never the frontend', () => {
  it('Agent group maps to Agent role', () => {
    const claims = { sub: 'u1', email: 'a@x.com', 'cognito:groups': ['Agent'] };
    const user = getUserFromClaims(claims);
    assert.equal(user.role, 'Agent');
    assert.equal(isAgent(user), true);
    assert.equal(canUpdateTicket(user), true);
  });

  it('users outside the Agent group are Customers', () => {
    const user = getUserFromClaims({ sub: 'u2', 'cognito:groups': ['Customer'] });
    assert.equal(user.role, 'Customer');
    assert.equal(canUpdateTicket(user), false);
  });


  it('recognizes API Gateway string forms of cognito:groups', () => {
    assert.equal(getUserFromClaims({ sub: 'a1', 'cognito:groups': '[Agent]' }).role, 'Agent');
    assert.equal(getUserFromClaims({ sub: 'a2', 'cognito:groups': '["Agent"]' }).role, 'Agent');
    assert.equal(getUserFromClaims({ sub: 'a3', 'cognito:groups': 'Customer,Agent' }).role, 'Agent');
    assert.equal(getUserFromClaims({ sub: 'c1', 'cognito:groups': '[Customer]' }).role, 'Customer');
  });

  it('claims parsed from Bearer header', () => {
    const token = mockJwt({ sub: 'u3', 'cognito:groups': ['Agent'] });
    const { getClaimsFromRequest } = require('../src/lib/auth');
    const claims = getClaimsFromRequest({ headers: { authorization: `Bearer ${token}` } });
    assert.equal(getUserFromClaims(claims).role, 'Agent');
  });

  it('claims preferred from API Gateway authorizer context', () => {
    const { getClaimsFromRequest } = require('../src/lib/auth');
    const req = {
      headers: {},
      requestContext: { authorizer: { jwt: { claims: { sub: 'u4', 'cognito:groups': [] } } } }
    };
    assert.equal(getUserFromClaims(getClaimsFromRequest(req)).sub, 'u4');
  });
});

describe('auth: cross-customer isolation', () => {
  const ticketA = { ticketId: 't1', createdBy: 'cust-A' };

  it('owner can view; other customer cannot', () => {
    assert.equal(canViewTicket(ticketA, { sub: 'cust-A', email: null, role: 'Customer' }), true);
    assert.equal(canViewTicket(ticketA, { sub: 'cust-B', email: null, role: 'Customer' }), false);
    assert.equal(canAccessComments(ticketA, { sub: 'cust-B', email: null, role: 'Customer' }), false);
  });

  it('agent can view everything and is the only role that can update', () => {
    const agent = { sub: 'agent-1', email: null, role: 'Agent' };
    assert.equal(canViewTicket(ticketA, agent), true);
    assert.equal(canUpdateTicket(agent), true);
    assert.equal(canUpdateTicket({ sub: 'cust-A', role: 'Customer' }), false);
  });
});
