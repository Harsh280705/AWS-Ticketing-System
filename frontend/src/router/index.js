import { createRouter, createWebHistory } from 'vue-router'
import Landing from '../views/Landing.vue'
import Dashboard from '../views/Dashboard.vue'
import AgentDashboard from '../views/AgentDashboard.vue'
import Login from '../views/Login.vue'
import CustomerLogin from '../views/CustomerLogin.vue'
import AgentLogin from '../views/AgentLogin.vue'
import Callback from '../views/Callback.vue'
import { isAllowed } from '../auth/guard'
import { isAuthConfigured, getStoredUser, roleFromProfile } from '../auth/cognito'
import { getMockToken, readMockPayload } from '../auth/mock'

async function currentAuthState() {
  const configured = isAuthConfigured()

  if (!configured) {
    const payload = readMockPayload(getMockToken())
    if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
      return { configured, authenticated: false, isAgent: false }
    }
    const role = payload.sub === 'agent-1' ? 'Agent' : 'Customer'
    return { configured, authenticated: true, isAgent: role === 'Agent' }
  }

  try {
    const user = await getStoredUser()
    const authenticated = !!user && !user.expired
    return {
      configured,
      authenticated,
      isAgent: authenticated && roleFromProfile(user.profile || {}) === 'Agent'
    }
  } catch {
    return { configured, authenticated: false, isAgent: false }
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Landing, meta: { requiresAuth: false } },
    { path: '/tickets', name: 'tickets', component: Dashboard, meta: { requiresAuth: true } },
    { path: '/agent-dashboard', name: 'agent-dashboard', component: AgentDashboard, meta: { requiresAuth: true, requiresAgent: true } },
    { path: '/login', name: 'login', component: Login, meta: { requiresAuth: false } },
    { path: '/customer-login', name: 'customer-login', component: CustomerLogin, meta: { requiresAuth: false } },
    { path: '/agent-login', name: 'agent-login', component: AgentLogin, meta: { requiresAuth: false } },
    { path: '/callback', name: 'callback', component: Callback, meta: { requiresAuth: false } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  const state = await currentAuthState()
  const decision = isAllowed(to, state)

  if (!decision.allowed && decision.redirect) {
    if (to.path === '/login' && decision.redirect === '/') {
      return state.isAgent ? '/agent-dashboard' : '/tickets'
    }
    if (to.meta?.requiresAgent && state.authenticated && !state.isAgent) return '/tickets'
    return decision.redirect
  }

  // Keep Customer and Agent workspaces genuinely separate.
  if (state.authenticated && state.isAgent && to.path === '/tickets') return '/agent-dashboard'
  if (state.authenticated && !state.isAgent && to.path === '/agent-dashboard') return '/tickets'

  return true
})

export default router
