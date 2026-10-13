// Local mock-auth helpers (development only — never a production credential).
// Fixture parity with backend/src/lib/mockUsers.js is asserted in tests/.

export const MOCK_USERS = [
  { sub: 'customer-a', email: 'customer-a@example.com', name: 'Customer A', role: 'Customer' },
  { sub: 'customer-b', email: 'customer-b@example.com', name: 'Customer B', role: 'Customer' },
  { sub: 'agent-1', email: 'agent-1@example.com', name: 'Agent One', role: 'Agent' }
]

const STORAGE_KEY = 'ticketing.mockToken'

// sessionStorage in browsers; in-memory fallback for node --test.
const memoryStore = { token: null }

function webStorage() {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
  } catch {
    /* unavailable (tests, SSR) */
  }
  return null
}

export function getMockToken() {
  const store = webStorage()
  if (store) return store.getItem(STORAGE_KEY)
  return memoryStore.token
}

export function setMockToken(token) {
  const store = webStorage()
  if (store) {
    if (token) store.setItem(STORAGE_KEY, token)
    else store.removeItem(STORAGE_KEY)
    return
  }
  memoryStore.token = token || null
}

export function clearMockToken() {
  setMockToken(null)
}

export function isMockToken(value) {
  return typeof value === 'string' && value.startsWith('mock.')
}

// Display-only decode (no verification — the backend re-verifies every call).
export function readMockPayload(token) {
  try {
    if (!isMockToken(token)) return null
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}
