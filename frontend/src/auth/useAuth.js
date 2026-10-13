import { computed, ref } from 'vue'
import { getStoredUser, isAuthConfigured, roleFromProfile, signInRedirect, signOutRedirect } from './cognito'
import { clearMockToken, getMockToken, readMockPayload, setMockToken } from './mock'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const configured = ref(isAuthConfigured())
const oidcUser = ref(null)
const mockUser = ref(null)
const initialized = ref(false)

export function useAuth() {
  const mockMode = computed(() => !configured.value)
  const authenticated = computed(() =>
    configured.value ? !!oidcUser.value && !oidcUser.value.expired : !!mockUser.value
  )
  const profile = computed(() => oidcUser.value?.profile || {})
  const role = computed(() =>
    configured.value
      ? oidcUser.value
        ? roleFromProfile(profile.value)
        : 'Customer'
      : mockUser.value?.role || 'Customer'
  )
  const isAgent = computed(() => role.value === 'Agent')
  const email = computed(() => (configured.value ? profile.value.email || '' : mockUser.value?.email || ''))
  const displayName = computed(() =>
    configured.value ? profile.value.name || profile.value.email || '' : mockUser.value?.name || ''
  )
  const userId = computed(() => (configured.value ? profile.value.sub || '' : mockUser.value?.sub || ''))
  const demoMode = computed(() => !configured.value && !mockUser.value)

  async function init() {
    if (initialized.value) return
    initialized.value = true

    if (configured.value) {
      try {
        oidcUser.value = await getStoredUser()
      } catch {
        oidcUser.value = null
      }
      return
    }

    const token = getMockToken()
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/auth/mock-me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('session expired')
      const data = await res.json()
      mockUser.value = data.user
    } catch {
      clearMockToken()
      mockUser.value = null
    }
  }

  async function login(expectedRole = '') {
    await signInRedirect(expectedRole)
  }

  async function logout() {
    mockUser.value = null
    clearMockToken()
    oidcUser.value = null
    await signOutRedirect().catch(() => {})
  }

  function setUserFromCallback(user) {
    oidcUser.value = user || null
  }

  async function loginAs(userIdToLogin) {
    const res = await fetch(`${API_URL}/auth/mock-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userIdToLogin })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || 'Mock sign-in failed.')
    setMockToken(data.token)
    mockUser.value = data.user
    return data.user
  }

  function mockPayload() {
    return readMockPayload(getMockToken())
  }

  return {
    configured,
    mockMode,
    authenticated,
    role,
    isAgent,
    email,
    displayName,
    userId,
    demoMode,
    oidcUser,
    mockUser,
    init,
    login,
    logout,
    loginAs,
    mockPayload,
    setUserFromCallback
  }
}
