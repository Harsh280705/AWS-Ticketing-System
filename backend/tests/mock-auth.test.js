'use strict';

// Pure unit tests for the local mock-auth scheme (no HTTP, no AWS).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MOCK_USERS,
  findMockUser,
  publicMockUsers,
  mintMockToken,
  verifyMockToken
} = require('../src/lib/mockUsers');
const { getUserFromClaims } = require('../src/lib/auth');

describe('mock fixtures', () => {
  it('provides exactly customer-a, customer-b, agent-1 with correct roles', () => {
    assert.deepEqual(MOCK_USERS.map((u) => u.sub), ['customer-a', 'customer-b', 'agent-1']);
    assert.equal(findMockUser('agent-1').role, 'Agent');
    assert.equal(findMockUser('customer-a').role, 'Customer');
    assert.equal(findMockUser('nobody'), null);
  });

  it('public directory exposes no secrets', () => {
    for (const u of publicMockUsers()) {
      assert.deepEqual(Object.keys(u).sort(), ['email', 'name', 'role', 'sub']);
    }
  });
});

describe('mock token mint/verify', () => {
  it('round-trips with role from the fixture', () => {
    const user = verifyMockToken(mintMockToken('agent-1'));
    assert.equal(user.sub, 'agent-1');
    assert.equal(user.role, 'Agent');
    assert.equal(user.mock, true);
  });

  it('ignores a tampered role claim (fixture always wins)', () => {
    const forged = `mock.${Buffer.from(JSON.stringify({ sub: 'customer-a', role: 'Agent', mock: true, exp: 9999999999 })).toString('base64url')}.local`;
    assert.equal(verifyMockToken(forged).role, 'Customer');
  });

  it('rejects unknown subs, bad shapes, and expired tokens', () => {
    const forgedSub = `mock.${Buffer.from(JSON.stringify({ sub: 'mallory', mock: true, exp: 9999999999 })).toString('base64url')}.local`;
    assert.equal(verifyMockToken(forgedSub), null);
    assert.equal(verifyMockToken('garbage'), null);
    assert.equal(verifyMockToken('Bearer abc'), null);
    const now = Math.floor(Date.now() / 1000);
    assert.equal(verifyMockToken(mintMockToken('customer-a', now - 100000), now), null);
  });

  it('is disabled when ALLOW_MOCK_AUTH=false', () => {
    const prev = process.env.ALLOW_MOCK_AUTH;
    process.env.ALLOW_MOCK_AUTH = 'false';
    try {
      assert.equal(verifyMockToken(mintMockToken('customer-a')), null);
    } finally {
      if (prev === undefined) delete process.env.ALLOW_MOCK_AUTH;
      else process.env.ALLOW_MOCK_AUTH = prev;
    }
  });
});

describe('production path rejects mock tokens', () => {
  it('getUserFromClaims returns null for mock:true claims', () => {
    assert.equal(getUserFromClaims({ sub: 'customer-a', mock: true }), null);
    assert.equal(getUserFromClaims({ sub: 'agent-1', mock: true, 'cognito:groups': ['Agent'] }), null);
  });

  it('still accepts genuine claims', () => {
    const user = getUserFromClaims({ sub: 'u1', 'cognito:groups': ['Agent'] });
    assert.equal(user.role, 'Agent');
  });
});
