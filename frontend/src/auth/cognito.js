import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

const cognitoAuthority = import.meta.env.VITE_COGNITO_AUTHORITY || ''
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || ''
const redirectUri = import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/callback'
const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI || 'http://localhost:5173/'
const scope = import.meta.env.VITE_COGNITO_SCOPE || 'openid email profile'
const EXPECTED_ROLE_KEY = 'supportly_expected_role'

export function isAuthConfigured() {
  return Boolean(cognitoAuthority && clientId)
}

let manager = null

export function getUserManager() {
  if (!isAuthConfigured()) return null
  if (!manager) {
    manager = new UserManager({
      authority: cognitoAuthority.replace(/\/$/, ''),
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      post_logout_redirect_uri: logoutUri,
      userStore: new WebStorageStateStore({ store: window.sessionStorage })
    })
  }
  return manager
}

export function getExpectedRole() {
  return window.sessionStorage.getItem(EXPECTED_ROLE_KEY) || ''
}

export function clearExpectedRole() {
  window.sessionStorage.removeItem(EXPECTED_ROLE_KEY)
}

export async function signInRedirect(expectedRole = '') {
  const mgr = getUserManager()
  if (!mgr) {
    throw new Error('Cognito is not configured. Set VITE_COGNITO_AUTHORITY and VITE_COGNITO_CLIENT_ID.')
  }

  if (expectedRole) window.sessionStorage.setItem(EXPECTED_ROLE_KEY, expectedRole)
  else clearExpectedRole()

  // Force Cognito to show sign-in instead of silently reusing the previous
  // hosted-login session. This matters when Customer and Agent are different users.
  await mgr.signinRedirect({ prompt: 'login' })
}

export async function handleSigninCallback() {
  const mgr = getUserManager()
  if (!mgr) throw new Error('Cognito is not configured.')
  return mgr.signinRedirectCallback()
}

export async function signOutRedirect() {
  // Cognito's discovered end-session flow can send some Hosted UI setups to
  // /login?id_token_hint=... and return HTTP 400. For this SPA we clear the
  // local OIDC session immediately and let the caller route back to the app.
  // signInRedirect() always uses prompt=login, so switching roles/accounts still
  // requires an explicit Cognito sign-in instead of silently reusing the user.
  const mgr = getUserManager()
  clearExpectedRole()
  if (!mgr) return
  await mgr.removeUser().catch(() => {})
  await mgr.clearStaleState().catch(() => {})
}

export async function getStoredUser() {
  const mgr = getUserManager()
  if (!mgr) return null
  return mgr.getUser()
}

export async function clearStoredUser() {
  const mgr = getUserManager()
  if (!mgr) return
  await mgr.removeUser()
}

export async function getAccessToken() {
  const user = await getStoredUser()
  return user && !user.expired ? user.access_token : null
}

export function groupsFromProfile(profile = {}) {
  const raw = profile['cognito:groups']
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw) return [raw]
  return []
}

// The backend treats any non-Agent Cognito user as a Customer. Keep the same
// rule in the UI so frontend and Lambda authorization never disagree.
export function roleFromProfile(profile = {}) {
  return groupsFromProfile(profile).includes('Agent') ? 'Agent' : 'Customer'
}
