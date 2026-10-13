<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthTokenProvider, ticketApi } from '../services/api'
import { getAccessToken, isAuthConfigured } from '../auth/cognito'
import { getMockToken } from '../auth/mock'
import { useAuth } from '../auth/useAuth'

const router = useRouter()
const auth = useAuth()

const loading = ref(false)
const apiError = ref('')
const tickets = ref([])
const selectedTicket = ref(null)
const search = ref('')
const statusFilter = ref('All statuses')
const priorityFilter = ref('All priorities')
const queueFilter = ref('All tickets')
const commentText = ref('')
const saving = ref(false)
const mobileSidebar = ref(false)
const workspaceView = ref('Queue')
const conversationError = ref('')
const settingsSaved = ref(false)
const agentPreferences = ref({
  soundAlerts: window.localStorage.getItem('supportly_agent_sound_alerts') === 'true',
  autoRefresh: window.localStorage.getItem('supportly_agent_auto_refresh') !== 'false',
  compactQueue: window.localStorage.getItem('supportly_agent_compact_queue') === 'true'
})

function isUnassigned(value) {
  if (value === undefined || value === null) return true
  const text = String(value).trim().toLowerCase()
  return !text || ['unassigned', 'nobody', 'none', 'null'].includes(text)
}

function normalizeComment(comment) {
  const mine = comment.authorId && comment.authorId === auth.userId.value
  const author = mine
    ? 'You'
    : comment.authorRole === 'Agent'
      ? (comment.authorEmail || 'Support Agent')
      : (comment.authorEmail || 'Customer')
  return { ...comment, author }
}

function normalize(ticket) {
  return {
    ...ticket,
    id: ticket.id || ticket.ticketId,
    title: ticket.title || 'Untitled ticket',
    description: ticket.description || '',
    status: ticket.status || 'Open',
    priority: ticket.priority || 'Medium',
    category: ticket.category || 'General',
    assignee: isUnassigned(ticket.assignee) ? '' : String(ticket.assignee),
    customer: ticket.customerEmail || ticket.createdByEmail || ticket.createdBy || 'Customer',
    createdAt: ticket.createdAt || '',
    updatedAt: ticket.updatedAt || ticket.createdAt || '',
    comments: Array.isArray(ticket.comments) ? ticket.comments.map(normalizeComment) : []
  }
}

function niceDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function priorityRank(priority) {
  return { Urgent: 0, High: 1, Medium: 2, Low: 3 }[priority] ?? 4
}

const visibleTickets = computed(() => {
  const query = search.value.trim().toLowerCase()
  return tickets.value
    .filter(ticket => {
      const searchable = `${ticket.id} ${ticket.title} ${ticket.customer} ${ticket.category}`.toLowerCase()
      const searchMatch = !query || searchable.includes(query)
      const statusMatch = statusFilter.value === 'All statuses' || ticket.status === statusFilter.value
      const priorityMatch = priorityFilter.value === 'All priorities' || ticket.priority === priorityFilter.value
      let queueMatch = true
      if (queueFilter.value === 'Unassigned') queueMatch = isUnassigned(ticket.assignee)
      if (queueFilter.value === 'Mine') queueMatch = ticket.assignee === auth.email.value
      if (queueFilter.value === 'Urgent') queueMatch = ['Urgent', 'High'].includes(ticket.priority)
      return searchMatch && statusMatch && priorityMatch && queueMatch
    })
    .sort((a, b) => {
      const byPriority = priorityRank(a.priority) - priorityRank(b.priority)
      if (byPriority !== 0) return byPriority
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    })
})

const totalCount = computed(() => tickets.value.length)
const openCount = computed(() => tickets.value.filter(t => t.status === 'Open').length)
const progressCount = computed(() => tickets.value.filter(t => t.status === 'In Progress').length)
const unassignedCount = computed(() => tickets.value.filter(t => isUnassigned(t.assignee)).length)
const urgentCount = computed(() => tickets.value.filter(t => ['Urgent', 'High'].includes(t.priority) && t.status !== 'Resolved' && t.status !== 'Closed').length)
const resolvedCount = computed(() => tickets.value.filter(t => ['Resolved', 'Closed'].includes(t.status)).length)
const myTickets = computed(() => tickets.value.filter(t => String(t.assignee || '').toLowerCase() === String(auth.email.value || '').toLowerCase()))
const activeMyTickets = computed(() => myTickets.value.filter(t => !['Resolved', 'Closed'].includes(t.status)))
const customerSummaries = computed(() => {
  const map = new Map()
  for (const ticket of tickets.value) {
    const key = ticket.customer || 'Customer'
    if (!map.has(key)) map.set(key, { customer: key, total: 0, open: 0, resolved: 0, high: 0 })
    const row = map.get(key)
    row.total += 1
    if (['Resolved', 'Closed'].includes(ticket.status)) row.resolved += 1
    else row.open += 1
    if (['Urgent', 'High'].includes(ticket.priority)) row.high += 1
  }
  return [...map.values()].sort((a, b) => b.open - a.open || b.total - a.total)
})
const resolutionRate = computed(() => totalCount.value ? Math.round((resolvedCount.value / totalCount.value) * 100) : 0)

async function loadTickets() {
  loading.value = true
  apiError.value = ''
  try {
    const result = await ticketApi.list()
    tickets.value = (result.tickets || []).map(normalize)
    if (selectedTicket.value) {
      const refreshed = tickets.value.find(t => t.id === selectedTicket.value.id)
      if (refreshed) selectedTicket.value = { ...selectedTicket.value, ...refreshed }
    }
  } catch (error) {
    if (error.status === 403) {
      apiError.value = 'AWS received this session as Customer, not Agent. Sign out and sign in again after confirming the user is in the Cognito Agent group.'
    } else {
      apiError.value = error.message || 'Could not load the support queue.'
    }
  } finally {
    loading.value = false
  }
}

async function refreshConversation(ticketId) {
  conversationError.value = ''
  try {
    const result = await ticketApi.comments(ticketId)
    if (selectedTicket.value?.id === ticketId) {
      selectedTicket.value = {
        ...selectedTicket.value,
        comments: (result.comments || []).map(normalizeComment)
      }
    }
  } catch (error) {
    conversationError.value = error.message || 'Could not refresh conversation.'
  }
}

async function openTicket(ticket) {
  apiError.value = ''
  conversationError.value = ''
  try {
    const detail = await ticketApi.get(ticket.id)
    selectedTicket.value = normalize(detail.ticket)
    // The dedicated comments endpoint is the source of truth for messages.
    await refreshConversation(ticket.id)
  } catch (error) {
    apiError.value = error.message || 'Could not open this ticket.'
  }
}

function resetAgentFilters() {
  search.value = ''
  statusFilter.value = 'All statuses'
  priorityFilter.value = 'All priorities'
  queueFilter.value = 'All tickets'
  apiError.value = ''
}

async function updateTicket(changes) {
  if (!selectedTicket.value || saving.value) return
  saving.value = true
  apiError.value = ''
  try {
    await ticketApi.update(selectedTicket.value.id, changes)
    await loadTickets()
    await openTicket({ id: selectedTicket.value.id })
  } catch (error) {
    apiError.value = error.message || 'Could not update the ticket.'
  } finally {
    saving.value = false
  }
}

async function assignToMe() {
  await updateTicket({ assignee: auth.email.value || auth.displayName.value || 'Agent' })
}

async function addComment() {
  const text = commentText.value.trim()
  if (!selectedTicket.value || !text || saving.value) return
  saving.value = true
  apiError.value = ''
  conversationError.value = ''
  const ticketId = selectedTicket.value.id
  try {
    const result = await ticketApi.addComment(ticketId, text)
    commentText.value = ''
    if (result.comment && selectedTicket.value?.id === ticketId) {
      selectedTicket.value = {
        ...selectedTicket.value,
        comments: [...selectedTicket.value.comments, normalizeComment(result.comment)]
      }
    }
    await refreshConversation(ticketId)
    await loadTickets()
  } catch (error) {
    conversationError.value = error.message || 'Could not add your reply.'
  } finally {
    saving.value = false
  }
}

async function signOut() {
  await auth.logout()
  router.replace('/')
}

function goHome() {
  router.push('/')
}

function setQueueFilter(value) {
  queueFilter.value = value
  mobileSidebar.value = false
  apiError.value = ''
}

function setWorkspaceView(value) {
  workspaceView.value = value
  mobileSidebar.value = false
  selectedTicket.value = null
  apiError.value = ''
}

function showQueue(value = 'All tickets') {
  workspaceView.value = 'Queue'
  setQueueFilter(value)
}

function openCustomer(customer) {
  workspaceView.value = 'Queue'
  queueFilter.value = 'All tickets'
  search.value = customer
  selectedTicket.value = null
}

function saveAgentSettings() {
  window.localStorage.setItem('supportly_agent_sound_alerts', String(agentPreferences.value.soundAlerts))
  window.localStorage.setItem('supportly_agent_auto_refresh', String(agentPreferences.value.autoRefresh))
  window.localStorage.setItem('supportly_agent_compact_queue', String(agentPreferences.value.compactQueue))
  settingsSaved.value = true
  window.setTimeout(() => { settingsSaved.value = false }, 1800)
}

onMounted(async () => {
  setAuthTokenProvider(async () => {
    if (isAuthConfigured()) return getAccessToken().catch(() => null)
    return getMockToken()
  })

  await auth.init()
  if (!auth.authenticated.value) {
    router.replace('/agent-login')
    return
  }
  if (!auth.isAgent.value) {
    router.replace('/customer-login')
    return
  }
  await loadTickets()
})
</script>

<template>
  <div class="agent-shell">
    <aside class="sidebar" :class="{ open: mobileSidebar }">
      <div class="brand-row">
        <div class="brand-mark">S</div>
        <div>
          <strong>Supportly</strong>
          <span>AGENT CONSOLE</span>
        </div>
      </div>

      <div class="role-card">
        <div class="role-icon">A</div>
        <div>
          <span>Signed in as</span>
          <strong>Support Agent</strong>
        </div>
        <i></i>
      </div>

      <p class="nav-label">QUEUE</p>
      <button class="nav-button" :class="{ active: queueFilter === 'All tickets' }" @click="showQueue('All tickets')">
        <span>▤</span> All tickets <b>{{ totalCount }}</b>
      </button>
      <button class="nav-button" :class="{ active: queueFilter === 'Unassigned' }" @click="showQueue('Unassigned')">
        <span>◎</span> Unassigned <b>{{ unassignedCount }}</b>
      </button>
      <button class="nav-button" :class="{ active: queueFilter === 'Mine' }" @click="showQueue('Mine')">
        <span>◉</span> My tickets
      </button>
      <button class="nav-button" :class="{ active: queueFilter === 'Urgent' }" @click="showQueue('Urgent')">
        <span>⚡</span> Priority queue <b>{{ urgentCount }}</b>
      </button>

      <p class="nav-label">WORKSPACE</p>
      <button class="nav-button" :class="{ active: workspaceView === 'Tasks' }" @click="setWorkspaceView('Tasks')">
        <span>◷</span> My tasks <b>{{ activeMyTickets.length }}</b>
      </button>
      <button class="nav-button" :class="{ active: workspaceView === 'Customers' }" @click="setWorkspaceView('Customers')">
        <span>♙</span> Customers <b>{{ customerSummaries.length }}</b>
      </button>
      <button class="nav-button" :class="{ active: workspaceView === 'Reports' }" @click="setWorkspaceView('Reports')">
        <span>▥</span> Reports
      </button>
      <button class="nav-button" :class="{ active: workspaceView === 'Settings' }" @click="setWorkspaceView('Settings')">
        <span>⚙</span> Settings
      </button>
      <button class="nav-button muted-nav" @click="goHome">
        <span>⌂</span> Landing page
      </button>

      <div class="sidebar-footer">
        <div class="agent-avatar">{{ (auth.displayName.value || auth.email.value || 'A').slice(0, 1).toUpperCase() }}</div>
        <div class="agent-meta">
          <strong>{{ auth.displayName.value || 'Support Agent' }}</strong>
          <span>{{ auth.email.value }}</span>
        </div>
        <button class="icon-button" title="Sign out" @click="signOut">↪</button>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="topbar-title">
          <button class="menu-button" @click="mobileSidebar = !mobileSidebar">☰</button>
          <div>
            <span>Support operations</span>
            <strong>{{ workspaceView === 'Queue' ? 'Agent dashboard' : workspaceView }}</strong>
          </div>
        </div>
        <div class="topbar-actions">
          <span class="live-pill"><i></i> AWS LIVE</span>
          <button class="refresh-button" :disabled="loading" @click="loadTickets">{{ loading ? 'Refreshing…' : 'Refresh queue' }}</button>
        </div>
      </header>

      <section class="workspace">
        <div v-if="apiError" class="error-banner">
          <div><strong>Request failed</strong><span>{{ apiError }}</span></div>
          <button @click="loadTickets">Retry</button>
        </div>

        <template v-if="workspaceView === 'Queue'">
        <section class="hero-row">
          <div>
            <p class="eyebrow">SUPPORT OPERATIONS</p>
            <h1>Good {{ new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening' }}, agent.</h1>
            <p>Monitor the queue, pick up unassigned work, and keep customer requests moving.</p>
          </div>
          <div class="hero-badge">
            <span>QUEUE HEALTH</span>
            <strong>{{ urgentCount ? `${urgentCount} need attention` : 'All clear' }}</strong>
          </div>
        </section>

        <section class="stats-grid">
          <article class="stat-card">
            <div class="stat-head"><span>Total queue</span><i>▤</i></div>
            <strong>{{ totalCount }}</strong>
            <small>Tickets visible to agents</small>
            <div class="stat-line"></div>
          </article>
          <article class="stat-card attention">
            <div class="stat-head"><span>Needs attention</span><i>⚡</i></div>
            <strong>{{ urgentCount }}</strong>
            <small>Urgent or high priority</small>
            <div class="stat-line"></div>
          </article>
          <article class="stat-card progress">
            <div class="stat-head"><span>In progress</span><i>◷</i></div>
            <strong>{{ progressCount }}</strong>
            <small>Actively being worked</small>
            <div class="stat-line"></div>
          </article>
          <article class="stat-card success">
            <div class="stat-head"><span>Resolved</span><i>✓</i></div>
            <strong>{{ resolvedCount }}</strong>
            <small>Completed requests</small>
            <div class="stat-line"></div>
          </article>
        </section>

        <section class="queue-layout">
          <article class="queue-panel">
            <div class="panel-heading">
              <div>
                <h2>Support queue</h2>
                <p>{{ visibleTickets.length }} ticket{{ visibleTickets.length === 1 ? '' : 's' }} in this view</p>
              </div>
              <span class="queue-count">{{ openCount }} open</span>
            </div>

            <div class="filters">
              <label class="search-box">
                <span>⌕</span>
                <input v-model="search" placeholder="Search ticket, customer or category…" />
              </label>
              <select v-model="statusFilter">
                <option>All statuses</option>
                <option>Open</option>
                <option>In Progress</option>
                <option>Resolved</option>
                <option>Closed</option>
              </select>
              <select v-model="priorityFilter">
                <option>All priorities</option>
                <option>Urgent</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <button class="filter-reset-button" type="button" @click="resetAgentFilters">Reset</button>
            </div>

            <div v-if="loading && !tickets.length" class="empty-state">
              <div class="spinner"></div>
              <strong>Loading support queue…</strong>
            </div>
            <div v-else-if="!visibleTickets.length" class="empty-state">
              <div class="empty-icon">✓</div>
              <strong>No tickets in this view</strong>
              <span>Try a different queue or filter.</span>
            </div>
            <div v-else class="ticket-list">
              <button
                v-for="ticket in visibleTickets"
                :key="ticket.id"
                class="ticket-row"
                :class="{ selected: selectedTicket?.id === ticket.id }"
                @click="openTicket(ticket)"
              >
                <div class="ticket-main">
                  <div class="ticket-id">{{ ticket.id }}</div>
                  <strong>{{ ticket.title }}</strong>
                  <span>{{ ticket.customer }}</span>
                </div>
                <span class="priority" :class="String(ticket.priority).toLowerCase()">{{ ticket.priority }}</span>
                <span class="status" :class="String(ticket.status).toLowerCase().replaceAll(' ', '-')">{{ ticket.status }}</span>
                <div class="assignee">
                  <span>{{ ticket.assignee || 'Unassigned' }}</span>
                  <small>{{ niceDate(ticket.updatedAt) }}</small>
                </div>
                <span class="chevron">›</span>
              </button>
            </div>
          </article>

          <aside class="detail-panel" :class="{ visible: selectedTicket }">
            <template v-if="selectedTicket">
              <div class="detail-top">
                <div>
                  <span class="detail-id">{{ selectedTicket.id }}</span>
                  <h2>{{ selectedTicket.title }}</h2>
                  <p>{{ selectedTicket.customer }}</p>
                </div>
                <button class="close-detail" @click="selectedTicket = null">×</button>
              </div>

              <p class="description">{{ selectedTicket.description || 'No description supplied.' }}</p>

              <div class="property-grid">
                <label>
                  <span>Status</span>
                  <select :value="selectedTicket.status" :disabled="saving" @change="updateTicket({ status: $event.target.value })">
                    <option>Open</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                    <option>Closed</option>
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select :value="selectedTicket.priority" :disabled="saving" @change="updateTicket({ priority: $event.target.value })">
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </label>
              </div>

              <div class="assignment-box">
                <div>
                  <span>Assigned agent</span>
                  <strong>{{ selectedTicket.assignee || 'Nobody yet' }}</strong>
                </div>
                <button :disabled="saving" @click="assignToMe">Assign to me</button>
              </div>

              <section class="conversation">
                <div class="conversation-head">
                  <h3>Conversation</h3>
                  <span>{{ selectedTicket.comments.length }} message{{ selectedTicket.comments.length === 1 ? '' : 's' }}</span>
                </div>
                <div v-if="conversationError" class="conversation-error">{{ conversationError }} <button type="button" @click="refreshConversation(selectedTicket.id)">Retry</button></div>
                <div v-if="!selectedTicket.comments.length && !conversationError" class="no-comments">No replies yet.</div>
                <div v-for="comment in selectedTicket.comments" :key="comment.id || comment.createdAt" class="comment">
                  <div class="comment-avatar">{{ String(comment.authorId || 'U').slice(0, 1).toUpperCase() }}</div>
                  <div>
                    <div class="comment-meta"><strong>{{ comment.author || 'User' }}</strong><span>{{ niceDate(comment.createdAt) }}</span></div>
                    <p>{{ comment.text }}</p>
                  </div>
                </div>
              </section>

              <form class="reply-box" @submit.prevent="addComment">
                <textarea v-model="commentText" rows="3" placeholder="Reply to the customer…"></textarea>
                <div>
                  <span>Visible to the customer</span>
                  <button :disabled="saving || !commentText.trim()">{{ saving ? 'Sending…' : 'Send reply' }}</button>
                </div>
              </form>
            </template>
            <div v-else class="detail-placeholder">
              <div>↗</div>
              <strong>Select a ticket</strong>
              <span>Ticket details and Agent controls will appear here.</span>
            </div>
          </aside>
        </section>
        </template>

        <section v-else-if="workspaceView === 'Tasks'" class="workspace-panel-page">
          <div class="workspace-page-head"><div><p class="eyebrow">AGENT WORKSPACE</p><h1>My tasks</h1><p>Tickets currently assigned to you.</p></div><button class="refresh-button" @click="showQueue('Mine')">Open in queue</button></div>
          <div v-if="!myTickets.length" class="workspace-empty"><span>✓</span><strong>No assigned tickets</strong><p>Pick an unassigned ticket from the queue to start working.</p><button @click="showQueue('Unassigned')">View unassigned</button></div>
          <div v-else class="workspace-list-card">
            <button v-for="ticket in myTickets" :key="ticket.id" class="workspace-ticket" @click="showQueue('Mine'); openTicket(ticket)"><div><strong>{{ ticket.title }}</strong><span>{{ ticket.customer }} · {{ ticket.id }}</span></div><span class="status" :class="String(ticket.status).toLowerCase().replaceAll(' ', '-')">{{ ticket.status }}</span><b>{{ ticket.priority }}</b></button>
          </div>
        </section>

        <section v-else-if="workspaceView === 'Customers'" class="workspace-panel-page">
          <div class="workspace-page-head"><div><p class="eyebrow">AGENT WORKSPACE</p><h1>Customers</h1><p>Customer ticket load and open work.</p></div><span class="hero-badge"><span>CUSTOMERS</span><strong>{{ customerSummaries.length }}</strong></span></div>
          <div class="customer-grid">
            <button v-for="row in customerSummaries" :key="row.customer" class="customer-card" @click="openCustomer(row.customer)"><div class="customer-avatar">{{ row.customer.slice(0,1).toUpperCase() }}</div><div class="customer-copy"><strong>{{ row.customer }}</strong><span>{{ row.total }} total · {{ row.open }} open · {{ row.resolved }} resolved</span></div><b v-if="row.high">{{ row.high }} high</b><span class="customer-arrow">›</span></button>
          </div>
        </section>

        <section v-else-if="workspaceView === 'Reports'" class="workspace-panel-page">
          <div class="workspace-page-head"><div><p class="eyebrow">OPERATIONS</p><h1>Reports</h1><p>Live queue metrics calculated from AWS ticket data.</p></div><button class="refresh-button" @click="loadTickets">Refresh data</button></div>
          <div class="report-grid"><article><span>Total tickets</span><strong>{{ totalCount }}</strong><small>All customer requests</small></article><article><span>Unassigned</span><strong>{{ unassignedCount }}</strong><small>Waiting for an owner</small></article><article><span>Resolution rate</span><strong>{{ resolutionRate }}%</strong><small>Resolved or closed</small></article><article><span>High priority</span><strong>{{ urgentCount }}</strong><small>Needs attention</small></article></div>
          <div class="report-card"><h2>Queue distribution</h2><div class="report-bar-row"><span>Open</span><div><i :style="{ width: `${totalCount ? (openCount/totalCount)*100 : 0}%` }"></i></div><b>{{ openCount }}</b></div><div class="report-bar-row"><span>In progress</span><div><i :style="{ width: `${totalCount ? (progressCount/totalCount)*100 : 0}%` }"></i></div><b>{{ progressCount }}</b></div><div class="report-bar-row"><span>Resolved</span><div><i :style="{ width: `${totalCount ? (resolvedCount/totalCount)*100 : 0}%` }"></i></div><b>{{ resolvedCount }}</b></div></div>
        </section>

        <section v-else-if="workspaceView === 'Settings'" class="workspace-panel-page">
          <div class="workspace-page-head"><div><p class="eyebrow">AGENT ACCOUNT</p><h1>Settings</h1><p>Agent profile, queue preferences and session controls.</p></div></div>
          <div class="agent-settings-grid"><article class="agent-settings-card"><h2>Profile</h2><div class="settings-data"><span>Name</span><strong>{{ auth.displayName.value || 'Support Agent' }}</strong></div><div class="settings-data"><span>Email</span><strong>{{ auth.email.value }}</strong></div><div class="settings-data"><span>Role</span><strong>Agent</strong></div><div class="settings-data"><span>Backend</span><strong>AWS live</strong></div></article><article class="agent-settings-card"><h2>Queue preferences</h2><label><div><strong>Sound alerts</strong><span>Alert when new work arrives.</span></div><input v-model="agentPreferences.soundAlerts" type="checkbox" /></label><label><div><strong>Auto refresh</strong><span>Keep the queue fresh while working.</span></div><input v-model="agentPreferences.autoRefresh" type="checkbox" /></label><label><div><strong>Compact queue</strong><span>Use denser ticket rows.</span></div><input v-model="agentPreferences.compactQueue" type="checkbox" /></label><button class="settings-save-agent" @click="saveAgentSettings">{{ settingsSaved ? 'Saved ✓' : 'Save preferences' }}</button></article><article class="agent-settings-card danger-agent"><h2>Session</h2><p>Sign out from this Agent console on this device.</p><button class="settings-signout-agent" @click="signOut">Sign out</button></article></div>
        </section>
      </section>
    </main>
  </div>
</template>

<style scoped>
*{box-sizing:border-box}.agent-shell{min-height:100vh;background:#0c0f17;color:#eef0f7;font-family:Inter,Manrope,system-ui,sans-serif}.sidebar{position:fixed;inset:0 auto 0 0;z-index:30;width:238px;padding:22px 14px 16px;border-right:1px solid #252a39;background:linear-gradient(180deg,#151824,#11141e);display:flex;flex-direction:column}.brand-row{display:flex;align-items:center;gap:11px;padding:3px 8px 21px}.brand-mark{display:grid;place-items:center;width:41px;height:41px;border-radius:12px;background:linear-gradient(145deg,#8a75ff,#6d54e8);box-shadow:0 12px 26px rgba(111,82,230,.25);font-weight:900}.brand-row strong,.brand-row span{display:block}.brand-row strong{font-size:16px}.brand-row span{margin-top:3px;color:#747b91;font-size:8px;font-weight:800;letter-spacing:1.8px}.role-card{display:flex;align-items:center;gap:10px;margin:2px 2px 20px;padding:11px;border:1px solid #2a2d40;border-radius:14px;background:#1a1d2b}.role-card .role-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(132,104,255,.16);color:#aa97ff;font-weight:900}.role-card span,.role-card strong{display:block}.role-card span{color:#71798e;font-size:8px}.role-card strong{margin-top:2px;font-size:11px}.role-card i{width:7px;height:7px;margin-left:auto;border-radius:50%;background:#54d895;box-shadow:0 0 13px rgba(84,216,149,.8)}.nav-label{margin:13px 10px 8px;color:#666d83;font-size:8px;font-weight:900;letter-spacing:1.7px}.nav-button{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:0 11px;border:0;border-radius:11px;background:transparent;color:#9ba2b5;text-align:left;font-size:11px;font-weight:700;cursor:pointer}.nav-button span{width:18px;color:#7e86a0;text-align:center}.nav-button b{margin-left:auto;padding:3px 7px;border-radius:7px;background:#262a3c;color:#aaafbf;font-size:9px}.nav-button:hover,.nav-button.active{color:#f4f2ff;background:#24263a}.nav-button.active span{color:#a995ff}.muted-nav{margin-top:2px}.sidebar-footer{display:flex;align-items:center;gap:9px;margin-top:auto;padding:13px 8px 3px;border-top:1px solid #242838}.agent-avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#ece9ff;color:#514590;font-weight:900}.agent-meta{min-width:0;flex:1}.agent-meta strong,.agent-meta span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.agent-meta strong{font-size:10px}.agent-meta span{margin-top:3px;color:#737a90;font-size:8px}.icon-button{width:30px;height:30px;border:1px solid #2d3142;border-radius:9px;background:#1b1e2c;color:#8e95a9;cursor:pointer}.main-area{min-height:100vh;margin-left:238px}.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;height:72px;padding:0 28px;border-bottom:1px solid #242938;background:rgba(16,19,29,.9);backdrop-filter:blur(18px)}.topbar-title{display:flex;align-items:center;gap:12px}.topbar-title span,.topbar-title strong{display:block}.topbar-title span{color:#7c849a;font-size:9px}.topbar-title strong{margin-top:2px;font-size:13px}.menu-button{display:none}.topbar-actions{display:flex;align-items:center;gap:10px}.live-pill{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #2a3d35;border-radius:9px;background:#18251f;color:#76d6a3;font-size:8px;font-weight:900;letter-spacing:.7px}.live-pill i{width:6px;height:6px;border-radius:50%;background:#67daa0}.refresh-button{min-height:34px;padding:0 12px;border:1px solid #303446;border-radius:9px;background:#202433;color:#c4c9d6;font-size:9px;font-weight:800;cursor:pointer}.workspace{padding:28px}.error-banner{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding:13px 14px;border:1px solid rgba(255,111,124,.25);border-radius:12px;background:rgba(117,45,55,.28);color:#e7b1b6}.error-banner strong,.error-banner span{display:block}.error-banner strong{font-size:10px}.error-banner span{margin-top:2px;font-size:9px}.error-banner button{border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#343849;color:white;padding:8px 12px;font-size:9px;font-weight:800}.hero-row{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:23px}.eyebrow{margin:0 0 8px;color:#8c7bf0;font-size:8px;font-weight:900;letter-spacing:1.8px}.hero-row h1{margin:0;font-size:28px;letter-spacing:-1px}.hero-row p:not(.eyebrow){margin:7px 0 0;color:#838ba0;font-size:11px}.hero-badge{min-width:175px;padding:12px 15px;border:1px solid #2b3041;border-radius:14px;background:#181c29}.hero-badge span,.hero-badge strong{display:block}.hero-badge span{color:#697187;font-size:7px;font-weight:900;letter-spacing:1.4px}.hero-badge strong{margin-top:5px;font-size:12px}.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.stat-card{position:relative;padding:16px;border:1px solid #282d3e;border-radius:15px;background:linear-gradient(145deg,#1a1e2c,#181b28);overflow:hidden}.stat-head{display:flex;align-items:center;justify-content:space-between;color:#9299ad;font-size:9px;font-weight:800}.stat-head i{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(132,106,255,.13);color:#a896ff;font-style:normal}.stat-card>strong{display:block;margin:13px 0 5px;font-size:26px}.stat-card small{color:#697087;font-size:8px}.stat-line{position:absolute;inset:auto 15px 0;height:3px;border-radius:3px;background:#7e67ef}.stat-card.attention .stat-head i{background:rgba(242,150,83,.13);color:#efa267}.stat-card.attention .stat-line{background:#e79b5b}.stat-card.progress .stat-head i{background:rgba(76,139,226,.14);color:#73a4e8}.stat-card.progress .stat-line{background:#5b8ed1}.stat-card.success .stat-head i{background:rgba(72,180,124,.14);color:#68c494}.stat-card.success .stat-line{background:#58b786}.queue-layout{display:grid;grid-template-columns:minmax(0,1fr) 365px;gap:14px;align-items:start}.queue-panel,.detail-panel{border:1px solid #282d3d;border-radius:17px;background:#171a26;box-shadow:0 20px 45px rgba(0,0,0,.12)}.queue-panel{overflow:hidden}.panel-heading{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;border-bottom:1px solid #252a39}.panel-heading h2{margin:0;font-size:14px}.panel-heading p{margin:3px 0 0;color:#747b8e;font-size:8px}.queue-count{padding:5px 8px;border:1px solid #313649;border-radius:8px;color:#9fa6b8;font-size:8px}.filters{display:grid;grid-template-columns:minmax(180px,1fr) 125px 125px 72px;gap:8px;padding:12px;border-bottom:1px solid #252a39}.search-box{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #303548;border-radius:10px;background:#12151f}.search-box span{color:#7f879c}.search-box input{width:100%;height:35px;border:0;outline:0;background:transparent;color:#e5e8f0;font-size:9px}.filters select,.property-grid select{border:1px solid #303548;border-radius:10px;background:#151925;color:#b5bbca;font-size:9px;outline:0}.filters select{padding:0 9px}.filter-reset-button{height:35px;border:1px solid #34394d;border-radius:10px;background:#202433;color:#c7cbd8;font-size:8px;font-weight:900;cursor:pointer}.filter-reset-button:hover{background:#292e40;color:#fff}.ticket-list{max-height:610px;overflow:auto}.ticket-row{display:grid;grid-template-columns:minmax(220px,1.7fr) 80px 95px 130px 16px;align-items:center;gap:10px;width:100%;padding:13px 15px;border:0;border-bottom:1px solid #232736;background:transparent;color:#e5e8ef;text-align:left;cursor:pointer}.ticket-row:hover,.ticket-row.selected{background:#1d2130}.ticket-row.selected{box-shadow:inset 3px 0 #866ff5}.ticket-main{min-width:0}.ticket-main .ticket-id{color:#7166ad;font-size:7px;font-weight:900;letter-spacing:.7px}.ticket-main strong,.ticket-main span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ticket-main strong{margin-top:4px;font-size:10px}.ticket-main span{margin-top:3px;color:#737b90;font-size:8px}.priority,.status{justify-self:start;padding:5px 7px;border-radius:7px;font-size:7px;font-weight:900}.priority.urgent{background:rgba(255,87,103,.13);color:#ff929d}.priority.high{background:rgba(235,144,73,.13);color:#eba76f}.priority.medium{background:rgba(100,143,223,.13);color:#8eb0eb}.priority.low{background:rgba(109,174,135,.13);color:#83c69d}.status{background:#262b3a;color:#a2a9ba}.status.open{background:rgba(238,163,76,.11);color:#e5aa67}.status.in-progress{background:rgba(80,139,226,.12);color:#82a9e6}.status.resolved,.status.closed{background:rgba(72,181,127,.12);color:#78c79d}.assignee span,.assignee small{display:block}.assignee span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px}.assignee small{margin-top:3px;color:#686f83;font-size:7px}.chevron{color:#686f86;font-size:18px}.empty-state{display:grid;place-items:center;min-height:300px;padding:35px;text-align:center}.empty-state strong,.empty-state span{display:block}.empty-state strong{margin-top:12px;font-size:12px}.empty-state span{margin-top:5px;color:#777f94;font-size:9px}.empty-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#202f29;color:#6bca98;font-size:18px}.spinner{width:34px;height:34px;border:3px solid #292e42;border-top-color:#8a74ff;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.detail-panel{position:sticky;top:88px;min-height:520px;padding:17px}.detail-top{display:flex;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid #272c3b}.detail-id{color:#8a78ec;font-size:8px;font-weight:900}.detail-top h2{margin:5px 0 4px;font-size:15px;line-height:1.3}.detail-top p{margin:0;color:#798196;font-size:8px}.close-detail{width:29px;height:29px;border:1px solid #303548;border-radius:9px;background:#1f2331;color:#8e95a8;font-size:16px}.description{margin:15px 0;color:#a3a9b8;font-size:9px;line-height:1.7}.property-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.property-grid label>span{display:block;margin-bottom:5px;color:#71798e;font-size:7px;font-weight:900;letter-spacing:.8px}.property-grid select{width:100%;height:36px;padding:0 8px}.assignment-box{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding:11px;border:1px solid #2a2f40;border-radius:11px;background:#131722}.assignment-box span,.assignment-box strong{display:block}.assignment-box span{color:#737b90;font-size:7px}.assignment-box strong{margin-top:3px;font-size:9px}.assignment-box button,.reply-box button{border:0;border-radius:9px;background:linear-gradient(135deg,#7359e7,#8d75ff);color:white;font-size:8px;font-weight:900;cursor:pointer}.assignment-box button{padding:8px 10px}.conversation{margin-top:15px}.conversation-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.conversation-head h3{margin:0;font-size:11px}.conversation-head span{color:#6f778d;font-size:7px}.no-comments{padding:14px;border:1px dashed #2c3142;border-radius:10px;color:#71798f;text-align:center;font-size:8px}.comment{display:grid;grid-template-columns:28px 1fr;gap:8px;padding:10px 0;border-bottom:1px solid #252a39}.comment-avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#252944;color:#aaa0e7;font-size:8px;font-weight:900}.comment-meta{display:flex;align-items:center;justify-content:space-between;gap:8px}.comment-meta strong{font-size:8px}.comment-meta span{color:#686f83;font-size:7px}.comment p{margin:5px 0 0;color:#9ca3b4;font-size:8px;line-height:1.55}.reply-box{margin-top:13px}.reply-box textarea{width:100%;resize:vertical;padding:10px;border:1px solid #303548;border-radius:10px;outline:0;background:#12151f;color:#d8dbe5;font:inherit;font-size:9px}.reply-box>div{display:flex;align-items:center;justify-content:space-between;margin-top:7px}.reply-box span{color:#676f84;font-size:7px}.reply-box button{padding:8px 12px}.detail-placeholder{display:grid;place-items:center;min-height:485px;text-align:center}.detail-placeholder div{display:grid;place-items:center;width:48px;height:48px;border:1px solid #303548;border-radius:15px;background:#1e2231;color:#8e7cf0;font-size:17px}.detail-placeholder strong{margin-top:13px;font-size:11px}.detail-placeholder span{max-width:210px;margin-top:5px;color:#70788d;font-size:8px;line-height:1.6}@media(max-width:1180px){.stats-grid{grid-template-columns:repeat(2,1fr)}.queue-layout{grid-template-columns:1fr}.detail-panel{position:relative;top:0}.ticket-row{grid-template-columns:minmax(200px,1fr) 75px 90px 115px 14px}}@media(max-width:760px){.sidebar{transform:translateX(-100%);transition:.25s}.sidebar.open{transform:translateX(0)}.main-area{margin-left:0}.menu-button{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid #303548;border-radius:9px;background:#1b1f2d;color:#bac0d0}.workspace{padding:18px}.hero-row{align-items:flex-start;flex-direction:column}.hero-badge{width:100%}.stats-grid{grid-template-columns:1fr 1fr}.filters{grid-template-columns:1fr}.filters select{height:35px}.ticket-row{grid-template-columns:1fr 72px 14px}.ticket-row .status,.ticket-row .assignee{display:none}.topbar{padding:0 17px}.live-pill{display:none}}@media(max-width:480px){.stats-grid{grid-template-columns:1fr}.property-grid{grid-template-columns:1fr}.topbar-title span{display:none}}

.workspace-panel-page{padding:4px 0}.workspace-page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:20px}.workspace-page-head h1{margin:0;font-size:28px;letter-spacing:-.8px}.workspace-page-head p:not(.eyebrow){margin:6px 0 0;color:#7b8397;font-size:10px}.workspace-empty{display:grid;place-items:center;min-height:330px;border:1px solid #282d3d;border-radius:17px;background:#171a26;text-align:center}.workspace-empty>span{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:rgba(77,184,126,.12);color:#77ca9b;font-size:20px}.workspace-empty strong{margin-top:12px}.workspace-empty p{margin:5px 0 14px;color:#737b90;font-size:9px}.workspace-empty button,.settings-save-agent,.settings-signout-agent{border:0;border-radius:9px;padding:9px 13px;background:linear-gradient(135deg,#7359e7,#8d75ff);color:#fff;font-size:8px;font-weight:900;cursor:pointer}.workspace-list-card,.report-card{overflow:hidden;border:1px solid #282d3d;border-radius:16px;background:#171a26}.workspace-ticket{display:grid;grid-template-columns:1fr 90px 70px;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;border-bottom:1px solid #252a39;background:transparent;color:#e8eaf1;text-align:left;cursor:pointer}.workspace-ticket:hover{background:#1d2130}.workspace-ticket div strong,.workspace-ticket div span{display:block}.workspace-ticket div strong{font-size:10px}.workspace-ticket div span{margin-top:4px;color:#737b90;font-size:8px}.workspace-ticket>b{color:#9fa5b7;font-size:8px}.customer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.customer-card{display:grid;grid-template-columns:42px 1fr auto 15px;align-items:center;gap:11px;padding:14px;border:1px solid #282d3d;border-radius:14px;background:#171a26;color:#e8eaf1;text-align:left;cursor:pointer}.customer-card:hover{border-color:#464064;background:#1b1f2d}.customer-avatar{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#252944;color:#a99df3;font-weight:900}.customer-copy{min-width:0}.customer-copy strong,.customer-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.customer-copy strong{font-size:9px}.customer-copy span{margin-top:4px;color:#737b90;font-size:7px}.customer-card>b{padding:4px 6px;border-radius:6px;background:rgba(235,144,73,.12);color:#e5a16b;font-size:7px}.customer-arrow{color:#70788d;font-size:18px}.report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:14px}.report-grid article{padding:16px;border:1px solid #282d3d;border-radius:14px;background:#171a26}.report-grid span,.report-grid strong,.report-grid small{display:block}.report-grid span{color:#838a9d;font-size:8px}.report-grid strong{margin:10px 0 4px;font-size:25px}.report-grid small{color:#686f83;font-size:7px}.report-card{padding:17px}.report-card h2{margin:0 0 15px;font-size:12px}.report-bar-row{display:grid;grid-template-columns:85px 1fr 28px;align-items:center;gap:10px;margin:11px 0}.report-bar-row>span,.report-bar-row>b{font-size:8px}.report-bar-row>div{height:6px;border-radius:5px;background:#242938;overflow:hidden}.report-bar-row i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#7359e7,#8d75ff)}.agent-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.agent-settings-card{padding:17px;border:1px solid #282d3d;border-radius:15px;background:#171a26}.agent-settings-card h2{margin:0 0 13px;font-size:12px}.agent-settings-card>p{color:#747c91;font-size:9px}.settings-data{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #252a39}.settings-data span{color:#757d91;font-size:8px}.settings-data strong{max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px}.agent-settings-card>label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #252a39;cursor:pointer}.agent-settings-card label strong,.agent-settings-card label span{display:block}.agent-settings-card label strong{font-size:8px}.agent-settings-card label span{margin-top:3px;color:#737b90;font-size:7px}.agent-settings-card input{width:16px;height:16px;accent-color:#816cf2}.settings-save-agent,.settings-signout-agent{width:100%;margin-top:13px}.danger-agent{border-color:rgba(255,111,124,.17)}.settings-signout-agent{background:#2b2027;color:#ff9aa4;border:1px solid rgba(255,111,124,.2)}.conversation-error{margin:8px 0;padding:8px;border:1px solid rgba(255,111,124,.2);border-radius:8px;background:rgba(117,45,55,.18);color:#e9aab1;font-size:8px}.conversation-error button{float:right;border:0;background:transparent;color:#fff;font-size:8px;font-weight:900;cursor:pointer}@media(max-width:950px){.report-grid{grid-template-columns:repeat(2,1fr)}.customer-grid,.agent-settings-grid{grid-template-columns:1fr}}@media(max-width:560px){.report-grid{grid-template-columns:1fr}.workspace-ticket{grid-template-columns:1fr 70px}.workspace-ticket>b{display:none}.customer-card{grid-template-columns:38px 1fr 14px}.customer-card>b{display:none}}
</style>
