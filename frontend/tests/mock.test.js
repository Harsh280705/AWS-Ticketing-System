import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mockBackend from '../../backend/src/lib/mockUsers.js'
import { MOCK_USERS, isMockToken, readMockPayload, setMockToken, getMockToken, clearMockToken } from '../src/auth/mock.js'

const { MOCK_USERS: BACKEND_USERS } = mockBackend

describe('mock fixture parity (frontend mirror == backend source of truth)', () => {
  it('same subs, emails, and roles on both sides', () => {
    assert.deepEqual(
      MOCK_USERS.map((u) => [u.sub, u.email, u.role]),
      BACKEND_USERS.map((u) => [u.sub, u.email, u.role])
    )
    assert.deepEqual(MOCK_USERS.map((u) => u.sub), ['customer-a', 'customer-b', 'agent-1'])
  })
})

describe('mock token helpers', () => {
  it('recognizes mock tokens and rejects everything else', () => {
    assert.equal(isMockToken('mock.abc.local'), true)
    assert.equal(isMockToken('Bearer mock.abc.local'), false)
    assert.equal(isMockToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig'), false)
    assert.equal(isMockToken(null), false)
  })

  it('decodes payloads for display and tolerates garbage', () => {
    const payload = { sub: 'customer-a', mock: true, exp: 9999999999 }
    const token = `mock.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.local`
    assert.deepEqual(readMockPayload(token), payload)
    assert.equal(readMockPayload('mock.!!!.local'), null)
    assert.equal(readMockPayload(null), null)
  })

  it('session storage round-trips (in-memory fallback under node)', () => {
    clearMockToken()
    assert.equal(getMockToken(), null)
    setMockToken('mock.x.local')
    assert.equal(getMockToken(), 'mock.x.local')
    clearMockToken()
    assert.equal(getMockToken(), null)
  })
})
