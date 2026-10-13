// Pure route-guard decision helper — unit-tested with node --test (no browser needed).
// Returns { allowed: boolean, redirect: string | null }.

export function isAllowed(to = {}, authState = {}) {
  const { requiresAuth = false, requiresAgent = false } = to.meta || {}
  const { configured = false, authenticated = false, isAgent = false } = authState

  // Public pages stay reachable without any session (both modes).
  // Protected pages always need a session: Cognito tokens in production,
  // mock login in local development. There is no silent demo bypass.
  if (requiresAuth && !authenticated) return { allowed: false, redirect: '/login' }
  if (requiresAgent && !isAgent) return { allowed: false, redirect: '/' }
  // Authenticated users should not sit on the login page.
  if (to.path === '/login' && authenticated) return { allowed: false, redirect: '/' }
  return { allowed: true, redirect: null }
}
