import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed } from '../src/auth/guard.js'

describe('frontend route guards', () => {
  it('public pages stay open without a session in local mode', () => {
    assert.deepEqual(isAllowed({ path: '/login', meta: {} }, { configured: false }), {
      allowed: true,
      redirect: null
    })
  })

  it('protected pages require a session in every mode (mock login locally)', () => {
    assert.deepEqual(
      isAllowed({ path: '/tickets', meta: { requiresAuth: true } }, { configured: false, authenticated: false }),
      { allowed: false, redirect: '/login' }
    )
    assert.deepEqual(
      isAllowed(
        { path: '/tickets', meta: { requiresAuth: true } },
        { configured: false, authenticated: true, isAgent: false }
      ),
      { allowed: true, redirect: null }
    )
  })

  it('redirects unauthenticated users to /login on protected routes', () => {
    assert.deepEqual(
      isAllowed({ path: '/', meta: { requiresAuth: true } }, { configured: true, authenticated: false }),
      { allowed: false, redirect: '/login' }
    )
  })

  it('allows authenticated customers on dashboard, blocks agent-only areas', () => {
    assert.deepEqual(
      isAllowed({ path: '/', meta: { requiresAuth: true } }, { configured: true, authenticated: true, isAgent: false }),
      { allowed: true, redirect: null }
    )
    assert.deepEqual(
      isAllowed(
        { path: '/admin', meta: { requiresAuth: true, requiresAgent: true } },
        { configured: true, authenticated: true, isAgent: false }
      ),
      { allowed: false, redirect: '/' }
    )
  })

  it('sends signed-in users away from /login', () => {
    assert.deepEqual(
      isAllowed({ path: '/login', meta: {} }, { configured: true, authenticated: true, isAgent: false }),
      { allowed: false, redirect: '/' }
    )
  })
})
