<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthTokenProvider, ticketApi } from '../services/api'
import { getAccessToken, isAuthConfigured } from '../auth/cognito'
import { getMockToken } from '../auth/mock'
import { useAuth } from '../auth/useAuth'

const router = useRouter()
const auth = useAuth()
const { isAgent, demoMode, authenticated, email, displayName, mockMode } = auth

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const activeNav = ref('Tickets')
const search = ref('')
const statusFilter = ref('All statuses')
const priorityFilter = ref('All priorities')
const showCreateModal = ref(false)
const selectedTicket = ref(null)
const commentText = ref('')
const loading = ref(false)
const saving = ref(false)
const apiError = ref('')
const tickets = ref([])
const attachmentFile = ref(null)
const uploadNote = ref('')
const settingsSaved = ref(false)
const customerPreferences = ref({
  emailUpdates: window.localStorage.getItem('supportly_customer_email_updates') !== 'false',
  browserNotifications: window.localStorage.getItem('supportly_customer_browser_notifications') === 'true',
  showResolved: window.localStorage.getItem('supportly_customer_show_resolved') !== 'false'
})

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const DRAFT_KEY = 'supportly_customer_ticket_draft'
const FAVORITES_KEY = 'supportly_customer_favorites'

function readLocalJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const favoriteIds = ref(readLocalJson(FAVORITES_KEY, []))
const savedDraft = readLocalJson(DRAFT_KEY, null)
const draftNotice = ref(Boolean(savedDraft && (savedDraft.title || savedDraft.description)))

const quickTemplates = [
  {
    name: 'Login / access',
    icon: '🔐',
    title: 'Unable to access my account',
    category: 'Access & Accounts',
    priority: 'High',
    description: 'I am unable to access my account. Please help me restore access. Steps already tried: '
  },
  {
    name: 'Technical issue',
    icon: '🛠',
    title: 'Application is not working as expected',
    category: 'Technical Issue',
    priority: 'Medium',
    description: `I am seeing an issue while using the application. What I expected:
What happened instead:
Steps to reproduce:`
  },
  {
    name: 'Billing question',
    icon: '💳',
    title: 'Question about billing or payment',
    category: 'Billing',
    priority: 'Medium',
    description: 'I need help with a billing or payment question. Relevant invoice / transaction details: '
  },
  {
    name: 'Account settings',
    icon: '⚙',
    title: 'Help changing account settings',
    category: 'Account Settings',
    priority: 'Low',
    description: 'I need help changing an account setting. Setting I want to change: '
  }
]

const form = ref({
  title: savedDraft?.title || '',
  description: savedDraft?.description || '',
  category: savedDraft?.category || 'Technical Issue',
  priority: savedDraft?.priority || 'Medium'
})

watch(form, value => {
  const hasContent = Boolean(value.title.trim() || value.description.trim())
  if (hasContent) {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value))
    draftNotice.value = true
  } else {
    window.localStorage.removeItem(DRAFT_KEY)
    draftNotice.value = false
  }
}, { deep: true })

function openCreateTicket() {
  showCreateModal.value = true
}

function applyTemplate(template) {
  form.value = {
    title: template.title,
    description: template.description,
    category: template.category,
    priority: template.priority
  }
  showCreateModal.value = true
}

function clearDraft() {
  form.value = { title: '', description: '', category: 'Technical Issue', priority: 'Medium' }
  window.localStorage.removeItem(DRAFT_KEY)
  draftNotice.value = false
}

function isFavorite(ticketId) {
  return favoriteIds.value.includes(ticketId)
}

function toggleFavorite(ticket) {
  const id = ticket.id || ticket.ticketId
  if (!id) return
  favoriteIds.value = isFavorite(id)
    ? favoriteIds.value.filter(item => item !== id)
    : [...favoriteIds.value, id]
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value))
}

function csvCell(value) {
  const normalized = String(value ?? '').replace(/"/g, '""')
  return `"${normalized}"`
}

function exportTicketsCsv() {
  const rows = [
    ['Ticket ID', 'Title', 'Category', 'Priority', 'Status', 'Assignee', 'Created'],
    ...tickets.value.map(ticket => [
      ticket.id,
      ticket.title,
      ticket.category,
      ticket.priority,
      ticket.status,
      ticket.assignee || 'Unassigned',
      ticket.date
    ])
  ]
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `supportly-my-tickets-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function startFollowUp(ticket) {
  form.value = {
    title: `Follow-up: ${ticket.title}`.slice(0, 120),
    description: `Following up on ${ticket.id}.\n\nWhat I still need help with: `,
    category: ticket.category || 'Technical Issue',
    priority: ticket.priority || 'Medium'
  }
  showCreateModal.value = true
}

const favoriteCount = computed(() => tickets.value.filter(ticket => isFavorite(ticket.id)).length)
const currentViewTitle = computed(() => activeNav.value === 'Favorites' ? 'Saved tickets' : 'Good morning')
const currentViewSubtitle = computed(() => activeNav.value === 'Favorites'
  ? 'Your starred requests, kept together for quick access.'
  : 'Here’s what’s happening with your support tickets today.')

function mapTicket(ticket) {
  const me = auth.userId.value || ''
  const replies = (ticket.comments || []).map(comment => ({
    id: comment.id,
    author: comment.authorId && comment.authorId === me ? 'You' : (comment.authorRole === 'Agent' ? (comment.authorEmail || 'Support Agent') : (comment.authorEmail || 'Customer')),
    text: comment.text,
    time: comment.createdAt
      ? new Date(comment.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : ''
  }))

  return {
    ...ticket,
    customer: ticket.createdBy && ticket.createdBy === me ? 'You' : (ticket.createdByEmail || ticket.createdBy || 'Customer'),
    initials: ticket.createdBy && ticket.createdBy === me
      ? 'YO'
      : String(ticket.createdBy || 'CU').slice(0, 2).toUpperCase(),
    date: ticket.createdAt
      ? new Date(ticket.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: '2-digit', year: 'numeric'
        })
      : 'Recently',
    comments: replies.length,
    replies,
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    activity: (ticket.activity || []).map(item => item.detail || item.type || String(item))
  }
}

async function loadTickets() {
  loading.value = true
  apiError.value = ''
  try {
    // Always load the complete queue. Search/status/priority are client-side
    // filters below. This prevents Retry/Refresh from replacing `tickets`
    // with a server-filtered subset, which made Reset appear broken.
    const result = await ticketApi.list()
    tickets.value = (result.tickets || []).map(mapTicket)
    if (selectedTicket.value) {
      const refreshed = tickets.value.find(t => t.id === selectedTicket.value.id)
      if (refreshed) selectedTicket.value = refreshed
    }
  } catch (error) {
    apiError.value = error.message || 'Could not load tickets. Is the backend running?'
  } finally {
    loading.value = false
  }
}

async function resetFilters() {
  search.value = ''
  statusFilter.value = 'All statuses'
  priorityFilter.value = 'All priorities'
  apiError.value = ''
  // Re-fetch the complete queue in case an older build previously loaded only
  // a filtered server-side subset.
  await loadTickets()
}

async function retryRequest() {
  apiError.value = ''
  await loadTickets()
}

function backToTickets() {
  selectedTicket.value = null
  apiError.value = ''
}

const filteredTickets = computed(() => {
  const query = search.value.trim().toLowerCase()
  return tickets.value.filter(ticket => {
    const matchesFavoriteView = activeNav.value !== 'Favorites' || isFavorite(ticket.id)
    const matchesSearch =
      !query ||
      String(ticket.id).toLowerCase().includes(query) ||
      String(ticket.title).toLowerCase().includes(query) ||
      String(ticket.customer).toLowerCase().includes(query)

    const matchesStatus = statusFilter.value === 'All statuses' || ticket.status === statusFilter.value
    const matchesPriority = priorityFilter.value === 'All priorities' || ticket.priority === priorityFilter.value
    const matchesResolvedPreference = customerPreferences.value.showResolved || !['Resolved', 'Closed'].includes(ticket.status)
    return matchesFavoriteView && matchesSearch && matchesStatus && matchesPriority && matchesResolvedPreference
  })
})

const openCount = computed(() => tickets.value.filter(ticket => ticket.status === 'Open').length)
const progressCount = computed(() => tickets.value.filter(ticket => ticket.status === 'In Progress').length)
const resolvedCount = computed(() => tickets.value.filter(ticket => ticket.status === 'Resolved').length)

async function createTicket() {
  if (!form.value.title.trim() || !form.value.description.trim() || saving.value) return
  saving.value = true
  apiError.value = ''
  uploadNote.value = ''
  try {
    const file = attachmentFile.value
    if (file && file.size > MAX_UPLOAD_BYTES) {
      apiError.value = 'Attachment must be 5 MB or smaller.'
      saving.value = false
      return
    }
    // Upload first so the returned key can be stored on the ticket at create.
    // Local mock associates on PUT; production S3 ignores query strings, so the
    // key travels in the create body (user-scoped, backend-verified).
    let attachmentKeys = []
    if (file) {
      try {
        const uploaded = await ticketApi.uploadAttachment(file)
        if (uploaded && uploaded.key) attachmentKeys = [uploaded.key]
      } catch (uploadError) {
        if (uploadError.code === 'AWS_NOT_CONFIGURED' || uploadError.status === 501) {
          uploadNote.value = 'Attachments activate after S3 setup — ticket created without the file.'
        } else {
          uploadNote.value = uploadError.message || 'Attachment upload failed — ticket was still created.'
        }
      }
    }
    // Create (with keys) so the upload is associated with the new ticket id.
    const result = await ticketApi.create({
      title: form.value.title.trim(),
      description: form.value.description.trim(),
      category: form.value.category,
      priority: form.value.priority,
      ...(attachmentKeys.length ? { attachmentKeys } : {})
    })
    const newId = result.ticket?.id || result.ticket?.ticketId
    form.value = { title: '', description: '', category: 'Technical Issue', priority: 'Medium' }
    window.localStorage.removeItem(DRAFT_KEY)
    draftNotice.value = false
    attachmentFile.value = null
    showCreateModal.value = false
    await loadTickets()
    selectedTicket.value = tickets.value.find(ticket => ticket.id === newId || ticket.ticketId === newId) || null
  } catch (error) {
    apiError.value = error.message || 'Could not create the ticket.'
  } finally {
    saving.value = false
  }
}

async function openTicket(ticket) {
  apiError.value = ''
  try {
    const detailResult = await ticketApi.get(ticket.id)
    let detailTicket = detailResult.ticket
    // Conversation has its own endpoint. Load it explicitly so messages stay
    // visible even when ticket-detail enrichment is degraded.
    try {
      const commentResult = await ticketApi.comments(ticket.id)
      detailTicket = { ...detailTicket, comments: commentResult.comments || [] }
    } catch {
      // Keep any comments already returned by GET /tickets/{id}.
    }
    selectedTicket.value = mapTicket(detailTicket)
  } catch (error) {
    apiError.value = error.message || 'Could not load ticket details.'
  }
}

async function updateStatus(event) {
  if (!selectedTicket.value) return
  const ticketId = selectedTicket.value.id
  apiError.value = ''
  try {
    await ticketApi.update(ticketId, { status: event.target.value })
    await loadTickets()
    await openTicket({ id: ticketId })
  } catch (error) {
    apiError.value = error.message || 'Could not update ticket status.'
  }
}

async function saveAssignee(event) {
  if (!selectedTicket.value) return
  const ticketId = selectedTicket.value.id
  apiError.value = ''
  try {
    await ticketApi.update(ticketId, { assignee: event.target.value })
    await loadTickets()
    await openTicket({ id: ticketId })
  } catch (error) {
    apiError.value = error.message || 'Could not update the assignee.'
  }
}

async function assignToMe() {
  if (!selectedTicket.value) return
  const ticketId = selectedTicket.value.id
  apiError.value = ''
  try {
    await ticketApi.update(ticketId, { assignee: email.value || 'You' })
    await loadTickets()
    await openTicket({ id: ticketId })
  } catch (error) {
    apiError.value = error.message || 'Could not assign the ticket.'
  }
}

async function savePriority(event) {
  if (!selectedTicket.value) return
  const ticketId = selectedTicket.value.id
  apiError.value = ''
  try {
    await ticketApi.update(ticketId, { priority: event.target.value })
    await loadTickets()
    await openTicket({ id: ticketId })
  } catch (error) {
    apiError.value = error.message || 'Could not update priority.'
  }
}

async function addComment() {
  if (!selectedTicket.value || !commentText.value.trim()) return
  const ticketId = selectedTicket.value.id
  const text = commentText.value.trim()
  apiError.value = ''
  try {
    await ticketApi.addComment(ticketId, text)
    commentText.value = ''
    await loadTickets()
    await openTicket({ id: ticketId })
  } catch (error) {
    apiError.value = error.message || 'Could not add comment.'
  }
}

function onAttachmentSelected(event) {
  const file = event.target.files && event.target.files[0]
  attachmentFile.value = file || null
  uploadNote.value = ''
}

async function downloadAttachment(att) {
  if (!att || !att.url) return
  apiError.value = ''
  try {
    // Absolute URLs are presigned S3 links (query-string auth included): fetch
    // them directly WITHOUT our Bearer token to avoid a pointless preflight.
    // Relative URLs are same-origin API/local-mock downloads needing the token.
    const absolute = /^https?:\/\//i.test(att.url)
    const target = absolute ? att.url : `${API_URL}${att.url}`
    const headers = {}
    if (!absolute) {
      const token = isAuthConfigured()
        ? await getAccessToken().catch(() => null)
        : getMockToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }
    const res = await fetch(target, { headers })
    if (!res.ok) throw new Error('Could not download the attachment.')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = att.filename || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
  } catch (error) {
    apiError.value = error.message || 'Could not download the attachment.'
  }
}

function saveCustomerSettings() {
  window.localStorage.setItem('supportly_customer_email_updates', String(customerPreferences.value.emailUpdates))
  window.localStorage.setItem('supportly_customer_browser_notifications', String(customerPreferences.value.browserNotifications))
  window.localStorage.setItem('supportly_customer_show_resolved', String(customerPreferences.value.showResolved))
  settingsSaved.value = true
  window.setTimeout(() => { settingsSaved.value = false }, 1800)
}

function signIn() {
  router.push('/login')
}

async function signOut() {
  await auth.logout()
  router.push('/login')
}

function switchUser() {
  router.push('/login')
}

onMounted(async () => {
  // Live mode (Cognito configured) prefers the Cognito access token so a stale
  // mock token from an earlier local session can never shadow it; mock mode
  // uses the mock token. The deployed API rejects mock tokens regardless.
  setAuthTokenProvider(async () => {
    if (isAuthConfigured()) return getAccessToken().catch(() => null);
    return getMockToken();
  })
  try {
    await auth.init()
  } catch {
    // Unauthenticated: the route guard sends the user to /login.
  }
  await loadTickets()
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">S</div>
        <div>
          <div class="brand-name">Supportly</div>
          <div class="brand-subtitle">SERVICE DESK</div>
        </div>
      </div>

      <div class="workspace-label">CUSTOMER</div>

      <button class="nav-item" :class="{ active: activeNav === 'Tickets' }"
        @click="activeNav = 'Tickets'; selectedTicket = null">
        <span class="nav-icon">▤</span><span>My tickets</span><span class="nav-count">{{ tickets.length }}</span>
      </button>
      <button class="nav-item" :class="{ active: activeNav === 'Favorites' }"
        @click="activeNav = 'Favorites'; selectedTicket = null">
        <span class="nav-icon">★</span><span>Saved tickets</span><span class="nav-count">{{ favoriteCount }}</span>
      </button>

      <div class="workspace-label second-label">ACCOUNT</div>
      <button class="nav-item" :class="{ active: activeNav === 'Settings' }"
        @click="activeNav = 'Settings'; selectedTicket = null">
        <span class="nav-icon">⚙</span><span>Settings</span>
      </button>

      <div class="sidebar-bottom">
        <div class="upgrade-card">
          <div class="upgrade-symbol">✦</div>
          <strong>Everything in one place</strong>
          <p>Keep track of every request and resolution.</p>
        </div>
        <div class="profile">
          <div class="avatar avatar-purple">YO</div>
          <div class="profile-info">
            <strong>{{ displayName || 'Your Workspace' }}</strong>
            <span>{{ mockMode ? 'Mock auth' : 'Cognito' }} · {{ isAgent ? 'Agent view' : 'Customer view' }}</span>
          </div>
          <span class="profile-menu">···</span>
        </div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumbs">
          <span>Workspace</span><span class="crumb-divider">/</span>
          <strong>{{ selectedTicket ? selectedTicket.id : activeNav }}</strong>
        </div>
        <div class="topbar-actions">
          <div class="environment-tag">
            <span class="environment-dot"></span>
            {{ mockMode ? 'LOCAL MOCK AUTH' : (isAgent ? 'Agent' : 'Customer') }}
          </div>
          <span v-if="authenticated" class="muted">{{ displayName || email }}</span>
          <button v-if="!authenticated" class="secondary-button" @click="signIn">Sign in</button>
          <button v-if="authenticated && mockMode" class="secondary-button" @click="switchUser">Switch user</button>
          <button v-if="authenticated" class="secondary-button" @click="signOut">Sign out</button>
          <div class="avatar avatar-purple">YO</div>
        </div>
      </header>

      <section v-if="apiError" class="content error-content">
        <div class="error-banner" role="alert">
          <strong>Request failed</strong>
          <span>{{ apiError }}</span>
          <button class="secondary-button" @click="retryRequest">Retry</button>
          <button class="error-dismiss" aria-label="Dismiss error" @click="apiError = ''">×</button>
        </div>
      </section>

      <section v-if="activeNav === 'Settings' && !selectedTicket" class="content customer-settings-page">
        <div class="page-heading">
          <div><div class="eyebrow">CUSTOMER ACCOUNT</div><h1>Settings</h1>
            <p>Manage your Supportly preferences and account session.</p></div>
          <button class="primary-button" @click="activeNav = 'Tickets'">Back to tickets</button>
        </div>

        <div class="settings-grid">
          <article class="panel settings-card">
            <div class="settings-card-head"><div><span class="settings-icon">◎</span><div><h2>Account</h2><p>Your authenticated Cognito profile.</p></div></div><span class="settings-badge">Customer</span></div>
            <div class="settings-row"><span>Name</span><strong>{{ displayName || 'Customer' }}</strong></div>
            <div class="settings-row"><span>Email</span><strong>{{ email || 'Not provided' }}</strong></div>
            <div class="settings-row"><span>Authentication</span><strong>{{ mockMode ? 'Local mock' : 'Amazon Cognito' }}</strong></div>
          </article>

          <article class="panel settings-card">
            <div class="settings-card-head"><div><span class="settings-icon">✦</span><div><h2>Ticket preferences</h2><p>These preferences are stored in this browser.</p></div></div></div>
            <label class="settings-toggle"><div><strong>Email updates</strong><span>Receive ticket status and reply reminders.</span></div><input v-model="customerPreferences.emailUpdates" type="checkbox" /></label>
            <label class="settings-toggle"><div><strong>Browser notifications</strong><span>Allow Supportly notification prompts on this device.</span></div><input v-model="customerPreferences.browserNotifications" type="checkbox" /></label>
            <label class="settings-toggle"><div><strong>Show resolved tickets</strong><span>Include resolved and closed tickets in your list.</span></div><input v-model="customerPreferences.showResolved" type="checkbox" /></label>
            <button class="primary-button settings-save" @click="saveCustomerSettings">{{ settingsSaved ? 'Saved ✓' : 'Save preferences' }}</button>
          </article>

          <article class="panel settings-card">
            <div class="settings-card-head"><div><span class="settings-icon">☁</span><div><h2>AWS connection</h2><p>The services currently backing this workspace.</p></div></div><span class="connection-dot">LIVE</span></div>
            <div class="settings-row"><span>API</span><strong>{{ API_URL.includes('execute-api') ? 'API Gateway' : 'Local API' }}</strong></div>
            <div class="settings-row"><span>Tickets</span><strong>DynamoDB</strong></div>
            <div class="settings-row"><span>Identity</span><strong>{{ mockMode ? 'Mock' : 'Cognito' }}</strong></div>
          </article>

          <article class="panel settings-card danger-card">
            <div class="settings-card-head"><div><span class="settings-icon">↪</span><div><h2>Session</h2><p>Sign out of this Customer workspace on this device.</p></div></div></div>
            <button class="secondary-button settings-signout" @click="signOut">Sign out</button>
          </article>
        </div>
      </section>

      <section v-else-if="selectedTicket" class="content">
        <button class="back-link" @click="backToTickets">← Back to all tickets</button>
        <div class="detail-heading">
          <div><div class="ticket-id">{{ selectedTicket.id }}</div><h1>{{ selectedTicket.title }}</h1>
            <p>Created by {{ selectedTicket.customer }} · {{ selectedTicket.date }}</p></div>
          <div class="detail-heading-actions">
            <button class="secondary-button" @click="toggleFavorite(selectedTicket)">{{ isFavorite(selectedTicket.id) ? '★ Saved' : '☆ Save ticket' }}</button>
            <button class="secondary-button" @click="startFollowUp(selectedTicket)">↗ Create follow-up</button>
            <span class="status-pill" :class="selectedTicket.status.toLowerCase().replace(' ', '-')">{{ selectedTicket.status }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-main">
            <article class="panel description-panel">
              <div class="panel-heading"><h2>Ticket description</h2>
                <span class="priority-pill" :class="selectedTicket.priority.toLowerCase()">{{ selectedTicket.priority }} priority</span>
              </div>
              <p class="description-text">{{ selectedTicket.description }}</p>
              <div class="ticket-meta"><span>Category</span><strong>{{ selectedTicket.category }}</strong></div>
              <div class="ticket-meta"><span>Assignee</span><strong>{{ selectedTicket.assignee || 'Unassigned' }}</strong></div>
              <div class="ticket-meta"><span>Attachments</span><strong>{{ (selectedTicket.attachments || []).length }}</strong></div>
              <div v-if="(selectedTicket.attachments || []).length" style="margin-top: 10px">
                <div v-for="att in selectedTicket.attachments" :key="att.key" class="ticket-meta">
                  <span>{{ att.filename }} · {{ Math.max(1, Math.round((att.size || 0) / 1024)) }} KB{{ att.mock ? ' · local mock' : '' }}</span>
                  <button v-if="att.url" class="secondary-button" style="min-height: 0; padding: 6px 10px" @click="downloadAttachment(att)">Download</button>
                  <span v-else class="muted" :title="att.key">stored</span>
                </div>
              </div>
              <div v-else class="muted" style="margin-top: 10px">No attachments yet.</div>
            </article>

            <article class="panel comments-panel">
              <div class="panel-heading"><h2>Conversation</h2><span class="muted">{{ selectedTicket.replies.length }} replies</span></div>
              <div v-if="selectedTicket.replies.length" class="reply-list">
                <div v-for="(reply, index) in selectedTicket.replies" :key="reply.id || index" class="reply">
                  <div class="avatar" :class="index % 2 ? 'avatar-blue' : 'avatar-purple'">
                    {{ reply.author.split(' ').map(word => word[0]).join('').slice(0, 2) }}
                  </div>
                  <div class="reply-body">
                    <div class="reply-header"><strong>{{ reply.author }}</strong><span>{{ reply.time }}</span></div>
                    <p>{{ reply.text }}</p>
                  </div>
                </div>
              </div>
              <div v-else class="no-replies">No comments yet. Start the conversation.</div>
              <form class="comment-form" @submit.prevent="addComment">
                <textarea v-model="commentText" rows="3" placeholder="Write a reply..." :disabled="saving"></textarea>
                <div class="comment-actions">
                  <span class="muted">Comments are saved by the API.</span>
                  <button class="primary-button" type="submit" :disabled="!commentText.trim() || saving">
                    {{ saving ? 'Sending…' : 'Send reply ↗' }}
                  </button>
                </div>
              </form>
            </article>
          </div>

          <aside class="detail-side">
            <article class="panel side-panel">
              <h2>Ticket properties</h2>
              <template v-if="isAgent || demoMode">
                <label class="field-label" for="ticket-status">Status</label>
                <select id="ticket-status" :value="selectedTicket.status" @change="updateStatus">
                  <option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option>
                </select>
                <label class="field-label" for="ticket-priority">Priority</label>
                <select id="ticket-priority" :value="selectedTicket.priority" @change="savePriority">
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
                <label class="field-label" for="ticket-assignee">Assignee</label>
                <select id="ticket-assignee" :value="selectedTicket.assignee || 'Unassigned'" @change="saveAssignee">
                  <option>Unassigned</option>
                  <option :value="email || 'You'">{{ email || 'You' }}</option>
                </select>
                <button class="secondary-button" style="width: 100%; margin-top: 10px" @click="assignToMe">
                  Assign to me
                </button>
              </template>
              <template v-else>
                <div class="ticket-meta"><span>Status</span><strong>{{ selectedTicket.status }}</strong></div>
                <div class="ticket-meta"><span>Priority</span><strong>{{ selectedTicket.priority }}</strong></div>
                <div class="ticket-meta"><span>Assignee</span><strong>{{ selectedTicket.assignee || 'Unassigned' }}</strong></div>
                <p class="muted" style="margin-top: 12px">Only agents can change status or assignment.</p>
              </template>
            </article>
            <article class="panel side-panel">
              <h2>Activity</h2>
              <div class="timeline">
                <div v-for="(item, index) in selectedTicket.activity" :key="index" class="timeline-item">
                  <span class="timeline-dot"></span>
                  <div><p>{{ item }}</p><span>Activity recorded</span></div>
                </div>
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section v-else class="content">
        <div v-if="demoMode" class="error-banner" role="note" style="margin-bottom: 20px">
          <span><strong>LOCAL MOCK MODE</strong> — showing local API data, not live AWS data. Sign in with a test user.</span>
          <button class="secondary-button" @click="router.push('/login')">Sign in</button>
        </div>
        <div v-if="uploadNote" class="error-banner" role="status" style="margin-bottom: 20px">
          <span>{{ uploadNote }}</span>
          <button class="error-dismiss" aria-label="Dismiss notice" @click="uploadNote = ''">×</button>
        </div>
        <div class="page-heading">
          <div><div class="eyebrow">{{ activeNav === 'Favorites' ? 'SAVED REQUESTS' : 'SUPPORT OVERVIEW' }}</div><h1>{{ currentViewTitle }} <span class="wave">✦</span></h1>
            <p>{{ currentViewSubtitle }}</p></div>
          <div class="heading-actions">
            <button class="secondary-button" @click="exportTicketsCsv" :disabled="!tickets.length">⇩ Export CSV</button>
            <button class="primary-button" @click="openCreateTicket"><span class="plus">＋</span> Create ticket</button>
          </div>
        </div>

        <div class="customer-feature-strip">
          <button class="feature-card" @click="openCreateTicket">
            <span class="feature-icon">✎</span><span><strong>Saved draft</strong><small>{{ draftNotice ? 'Draft ready to continue' : 'Autosaves while you type' }}</small></span>
          </button>
          <button class="feature-card" @click="activeNav = 'Favorites'">
            <span class="feature-icon">★</span><span><strong>Saved tickets</strong><small>{{ favoriteCount }} starred request{{ favoriteCount === 1 ? '' : 's' }}</small></span>
          </button>
          <button class="feature-card" @click="applyTemplate(quickTemplates[0])">
            <span class="feature-icon">⚡</span><span><strong>Quick templates</strong><small>{{ quickTemplates.length }} ready-made request types</small></span>
          </button>
          <button class="feature-card" @click="exportTicketsCsv" :disabled="!tickets.length">
            <span class="feature-icon">⇩</span><span><strong>Export tickets</strong><small>Download your history as CSV</small></span>
          </button>
          <div class="feature-card static-card">
            <span class="feature-icon">↗</span><span><strong>One-click follow-up</strong><small>Open any ticket to create a linked follow-up</small></span>
          </div>
        </div>

        <div class="stats-grid">
          <article class="stat-card"><div class="stat-top"><span>Total tickets</span><span class="stat-icon icon-indigo">▤</span></div>
            <div class="stat-number">{{ tickets.length }}</div><div class="stat-caption">{{ loading ? 'Loading tickets…' : 'Across all statuses' }}</div>
            <div class="stat-track"><span class="track-indigo" :style="{ width: `${tickets.length ? 100 : 0}%` }"></span></div>
          </article>
          <article class="stat-card"><div class="stat-top"><span>Open tickets</span><span class="stat-icon icon-orange">◷</span></div>
            <div class="stat-number">{{ openCount }}</div><div class="stat-caption"><span class="orange-text">Needs attention</span></div>
            <div class="stat-track"><span class="track-orange" :style="{ width: `${openCount / Math.max(tickets.length, 1) * 100}%` }"></span></div>
          </article>
          <article class="stat-card"><div class="stat-top"><span>In progress</span><span class="stat-icon icon-blue">↻</span></div>
            <div class="stat-number">{{ progressCount }}</div><div class="stat-caption">Currently being worked on</div>
            <div class="stat-track"><span class="track-blue" :style="{ width: `${progressCount / Math.max(tickets.length, 1) * 100}%` }"></span></div>
          </article>
          <article class="stat-card"><div class="stat-top"><span>Resolved</span><span class="stat-icon icon-green">✓</span></div>
            <div class="stat-number">{{ resolvedCount }}</div><div class="stat-caption">Successfully resolved</div>
            <div class="stat-track"><span class="track-green" :style="{ width: `${resolvedCount / Math.max(tickets.length, 1) * 100}%` }"></span></div>
          </article>
        </div>

        <div class="table-panel panel">
          <div class="table-heading"><div><h2>{{ activeNav === 'Favorites' ? 'Saved tickets' : 'All tickets' }}</h2><p>{{ activeNav === 'Favorites' ? 'Requests you starred for quick access.' : 'Track every request you have raised.' }}</p></div>
            <span class="record-count">{{ filteredTickets.length }} records</span></div>
          <div class="filters">
            <div class="search-box"><span>⌕</span><input v-model="search" placeholder="Search tickets..." /><kbd>⌘ K</kbd></div>
            <select v-model="statusFilter" aria-label="Filter by status">
              <option>All statuses</option><option>Open</option><option>In Progress</option><option>Resolved</option><option>Closed</option>
            </select>
            <select v-model="priorityFilter" aria-label="Filter by priority">
              <option>All priorities</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
            <button class="secondary-button filter-reset" @click="resetFilters" :disabled="loading">{{ loading ? 'Resetting…' : 'Reset' }}</button>
          </div>

          <div class="table-scroll">
            <table>
              <thead><tr><th>Ticket</th><th>Customer</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Created</th><th></th></tr></thead>
              <tbody>
                <tr v-for="ticket in filteredTickets" :key="ticket.id" @click="openTicket(ticket)">
                  <td><div class="ticket-cell"><button class="favorite-button" :class="{ saved: isFavorite(ticket.id) }" :title="isFavorite(ticket.id) ? 'Remove from saved tickets' : 'Save ticket'" @click.stop="toggleFavorite(ticket)">{{ isFavorite(ticket.id) ? '★' : '☆' }}</button><span class="ticket-mini-icon">▤</span><div>
                    <strong>{{ ticket.title }}</strong><span>{{ ticket.id }} · {{ ticket.category }}</span></div></div></td>
                  <td><div class="customer-cell"><div class="avatar avatar-blue">{{ ticket.initials }}</div><span>{{ ticket.customer }}</span></div></td>
                  <td><span class="priority-pill" :class="ticket.priority.toLowerCase()"><span class="priority-dot"></span>{{ ticket.priority }}</span></td>
                  <td><span class="status-pill" :class="ticket.status.toLowerCase().replace(' ', '-')"><span class="status-dot"></span>{{ ticket.status }}</span></td>
                  <td class="assignee-cell">{{ ticket.assignee || 'Unassigned' }}</td><td class="date-cell">{{ ticket.date }}</td>
                  <td><button class="row-arrow" title="Open ticket" @click.stop="openTicket(ticket)">↗</button></td>
                </tr>
                <tr v-if="!filteredTickets.length"><td colspan="7" class="empty-table">
                  <div class="empty-icon">⌕</div><strong>{{ loading ? 'Loading tickets…' : 'No tickets found' }}</strong>
                  <p>{{ apiError ? 'Check that the backend is running.' : 'Try changing your search or filters, or create a ticket.' }}</p>
                </td></tr>
              </tbody>
            </table>
          </div>
          <div class="table-footer"><span>Showing {{ filteredTickets.length }} of {{ tickets.length }} tickets</span>
            <span>{{ loading ? 'Refreshing…' : (API_URL.includes('execute-api.') ? 'Connected to AWS API' : 'Connected to local API') }} <span class="live-dot"></span></span></div>
        </div>
        <div class="footer-note"><span>✦</span> Supportly workspace <span class="footer-separator">·</span> {{ API_URL.includes('execute-api.') ? 'AWS live data' : 'Local API data' }}</div>
      </section>
    </main>

    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
      <form class="create-modal" @submit.prevent="createTicket">
        <div class="modal-heading"><div><div class="eyebrow">NEW REQUEST</div><h2>Create a ticket</h2>
          <p>Describe the issue and we'll get it to the right person.</p></div>
          <button type="button" class="icon-button close-button" @click="showCreateModal = false">×</button></div>
        <div class="draft-banner">
          <span>{{ draftNotice ? 'Draft autosaved in this browser.' : 'Your draft will autosave as you type.' }}</span>
          <button v-if="draftNotice" type="button" class="draft-clear" @click="clearDraft">Clear draft</button>
        </div>
        <div class="template-picker">
          <span class="field-label template-label">Start from a template</span>
          <div class="template-grid">
            <button v-for="template in quickTemplates" :key="template.name" type="button" class="template-button" @click="applyTemplate(template)">
              <span>{{ template.icon }}</span><strong>{{ template.name }}</strong>
            </button>
          </div>
        </div>
        <label class="field-label" for="new-title">Ticket title *</label>
        <input id="new-title" v-model="form.title" required maxlength="120" placeholder="Briefly describe the issue" />
        <label class="field-label" for="new-description">Description *</label>
        <textarea id="new-description" v-model="form.description" required rows="4" placeholder="Explain what happened and what you expected..."></textarea>
        <div class="form-row">
          <div><label class="field-label" for="new-category">Category</label>
            <select id="new-category" v-model="form.category"><option>Technical Issue</option><option>Access & Accounts</option><option>Billing</option><option>Account Settings</option><option>Other</option></select></div>
          <div><label class="field-label" for="new-priority">Priority</label>
            <select id="new-priority" v-model="form.priority"><option>Low</option><option>Medium</option><option>High</option></select></div>
        </div>
        <label class="field-label" for="new-attachment">Attachment (optional, 5 MB max)</label>
        <input id="new-attachment" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" @change="onAttachmentSelected" />
        <p v-if="attachmentFile" class="muted" style="margin-top: 8px">Selected: {{ attachmentFile.name }}</p>
        <div class="modal-footer"><button type="button" class="secondary-button" @click="showCreateModal = false">Cancel</button>
          <button type="submit" class="primary-button" :disabled="saving">{{ saving ? 'Creating…' : 'Create ticket ↗' }}</button></div>
      </form>
    </div>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');

:root {
  font-family: 'DM Sans', sans-serif;
  color: #20243a;
  background: #f7f8fc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-optical-sizing: auto;
  font-weight: 400;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 360px; min-height: 100vh; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #c8c8ff; outline-offset: 2px; }
.app-shell { min-height: 100vh; }
.sidebar { width: 248px; background: #fff; border-right: 1px solid #eaecf2; position: fixed; inset: 0 auto 0 0; display: flex; flex-direction: column; padding: 27px 17px 0; z-index: 5; }
.brand { display: flex; align-items: center; gap: 11px; padding: 0 8px 38px; }
.brand-mark { width: 39px; height: 39px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(140deg, #6559ec, #8c7dff); color: white; font-family: Manrope, sans-serif; font-size: 23px; font-weight: 800; box-shadow: 0 5px 14px #7064e638; }
.brand-name { font: 800 18px Manrope, sans-serif; letter-spacing: -.7px; }
.brand-subtitle { font-size: 9px; color: #9a9db0; letter-spacing: 1.8px; margin-top: 3px; font-weight: 700; }
.workspace-label { font-size: 10px; letter-spacing: 1.4px; font-weight: 700; color: #a4a7b8; padding: 0 10px 12px; }
.second-label { margin-top: 33px; }
.nav-item { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: transparent; color: #777b91; text-align: left; padding: 12px; border-radius: 9px; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.nav-item:hover { background: #f7f7ff; color: #5c52d9; }
.nav-item.active { color: #5c52d9; background: #f0efff; }
.nav-icon { width: 19px; text-align: center; font-size: 17px; }
.nav-count { margin-left: auto; font-size: 11px; border-radius: 5px; background: #fff; padding: 3px 7px; }
.sidebar-bottom { margin-top: auto; }
.upgrade-card { padding: 16px; border: 1px solid #eeedfb; background: linear-gradient(145deg, #faf9ff, #f5f4ff); border-radius: 12px; margin-bottom: 20px; }
.upgrade-symbol { color: #7669ee; font-size: 20px; margin-bottom: 9px; }
.upgrade-card strong { display: block; font-size: 12px; }
.upgrade-card p { font-size: 11px; color: #8588a0; line-height: 1.6; margin: 6px 0 0; }
.profile { display: flex; align-items: center; gap: 9px; padding: 17px 2px 19px; border-top: 1px solid #f0f0f5; }
.avatar { flex: 0 0 auto; width: 31px; height: 31px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
.avatar-purple { background: #ece9ff; color: #675bd8; }
.avatar-blue { background: #e4f0ff; color: #4379bb; }
.profile-info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.profile-info strong { font-size: 11px; }
.profile-info span { font-size: 10px; color: #999bad; white-space: nowrap; }
.profile-menu { margin-left: auto; color: #a3a4b3; letter-spacing: 1px; }
.main-area { margin-left: 248px; min-height: 100vh; }
.topbar { height: 76px; display: flex; align-items: center; justify-content: space-between; padding: 0 38px; border-bottom: 1px solid #ebedf3; background: #fff; }
.breadcrumbs { display: flex; align-items: center; gap: 12px; color: #a0a2b3; font-size: 12px; }
.breadcrumbs strong { color: #454960; font-weight: 600; }
.crumb-divider { color: #d0d1db; }
.topbar-actions { display: flex; align-items: center; gap: 17px; }
.environment-tag { display: flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid #e6e8ef; border-radius: 7px; font-size: 10px; color: #777b91; }
.environment-dot, .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #39b982; display: inline-block; }
.icon-button { border: 0; background: transparent; color: #777b91; font-size: 22px; padding: 5px; }
.content { max-width: 1600px; padding: 38px 38px 24px; margin: 0 auto; }
.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 30px; }
.eyebrow { font-size: 10px; font-weight: 700; color: #8b83e9; letter-spacing: 1.5px; margin-bottom: 8px; }
h1, h2, p { margin-top: 0; }
h1 { font: 800 27px Manrope, sans-serif; letter-spacing: -.8px; margin-bottom: 8px; color: #20243a; }
.page-heading p, .detail-heading p { color: #9295a9; font-size: 12px; margin-bottom: 0; }
.wave { color: #8d80f3; font-size: 24px; }
.primary-button, .secondary-button { border-radius: 8px; padding: 11px 15px; font-size: 12px; font-weight: 700; display: inline-flex; justify-content: center; align-items: center; gap: 7px; transition: .15s ease; }
.primary-button { background: #665be9; color: #fff; border: 1px solid #665be9; box-shadow: 0 3px 7px #655be921; }
.primary-button:hover { background: #574bd7; transform: translateY(-1px); }
.secondary-button { background: #fff; color: #656980; border: 1px solid #e4e6ee; }
.secondary-button:hover { background: #f8f8fc; }
.plus { font-size: 17px; font-weight: 400; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 17px; margin-bottom: 26px; }
.stat-card { padding: 20px 20px 17px; background: #fff; border: 1px solid #eaecf3; border-radius: 12px; min-width: 0; }
.stat-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #888ba0; font-weight: 600; }
.stat-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; font-size: 16px; }
.icon-indigo { background: #f0efff; color: #7669eb; }
.icon-orange { background: #fff2e8; color: #e99750; }
.icon-blue { background: #eaf3ff; color: #5293df; }
.icon-green { background: #e7f8f0; color: #3db58b; }
.stat-number { font: 800 28px Manrope, sans-serif; margin: 13px 0 5px; letter-spacing: -1px; }
.stat-caption { font-size: 10px; color: #a0a2b4; margin-bottom: 15px; }
.orange-text { color: #e29a55; }
.stat-track { height: 4px; background: #f0f1f6; border-radius: 8px; overflow: hidden; }
.stat-track span { display: block; height: 100%; border-radius: 8px; }
.track-indigo { background: #7b70ee; }
.track-orange { background: #f2a25b; }
.track-blue { background: #5da3ee; }
.track-green { background: #45bd91; }
.panel { background: #fff; border: 1px solid #e9ebf2; border-radius: 12px; }
.table-panel { overflow: hidden; }
.table-heading { display: flex; align-items: center; justify-content: space-between; padding: 23px 23px 19px; }
.panel h2, .table-heading h2 { font: 700 14px Manrope, sans-serif; margin-bottom: 6px; color: #30344b; }
.table-heading p { font-size: 11px; color: #999caf; margin: 0; }
.record-count { background: #f5f5fb; color: #797d94; border-radius: 6px; padding: 7px 9px; font-size: 10px; }
.filters { display: flex; align-items: center; gap: 10px; padding: 0 23px 18px; }
.search-box { display: flex; align-items: center; gap: 9px; border: 1px solid #e7e9f0; border-radius: 7px; padding: 0 10px; height: 36px; flex: 1; min-width: 120px; color: #a4a6b7; }
.search-box > span { font-size: 22px; }
.search-box input { border: 0; outline: 0; min-width: 0; flex: 1; font-size: 11px; color: #40445b; background: transparent; }
.search-box input:focus-visible { outline: none; }
.search-box kbd { font-size: 9px; border: 1px solid #e7e8ef; padding: 3px 5px; border-radius: 4px; white-space: nowrap; }
.filters select, .side-panel select, .create-modal select { background: #fff; border: 1px solid #e5e7ef; border-radius: 7px; color: #686c82; padding: 9px 10px; font-size: 10px; max-width: 150px; }
.filter-reset { padding: 9px 11px; font-size: 10px; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; text-align: left; white-space: nowrap; }
thead { background: #fafbfe; }
th { color: #9a9db0; font-size: 9px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; padding: 13px 15px; border-top: 1px solid #f0f1f6; border-bottom: 1px solid #f0f1f6; }
th:first-child, td:first-child { padding-left: 23px; }
td { padding: 15px; border-bottom: 1px solid #f1f2f7; font-size: 10px; color: #777b91; }
tbody tr { cursor: pointer; transition: background .15s; }
tbody tr:hover { background: #fafaff; }
tbody tr:last-child td { border-bottom: 0; }
.ticket-cell { display: flex; align-items: center; gap: 10px; min-width: 235px; }
.ticket-mini-icon { width: 30px; height: 30px; display: grid; place-items: center; background: #f2f0ff; border-radius: 8px; color: #7669eb; font-size: 15px; }
.ticket-cell div { display: flex; flex-direction: column; gap: 5px; }
.ticket-cell strong { font-size: 11px; color: #41455c; font-weight: 600; }
.ticket-cell div span { font-size: 9px; color: #a2a4b5; }
.customer-cell { display: flex; align-items: center; gap: 8px; }
.customer-cell span { color: #656980; }
.priority-pill, .status-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; padding: 6px 8px; font-size: 9px; font-weight: 600; }
.priority-pill.high { color: #db6666; background: #fff0f0; }
.priority-pill.medium { color: #d99a43; background: #fff7e9; }
.priority-pill.low { color: #48a88c; background: #eaf8f3; }
.priority-dot, .status-dot { height: 5px; width: 5px; border-radius: 50%; background: currentColor; }
.status-pill.open { color: #dd9250; background: #fff5e8; }
.status-pill.in-progress { color: #598ee0; background: #edf4ff; }
.status-pill.resolved { color: #3ba781; background: #eaf8f2; }
.status-pill.closed { color: #85889a; background: #f0f1f5; }
.assignee-cell { color: #656980; }
.date-cell { color: #989bad; }
.row-arrow { border: 0; background: transparent; color: #9a9cb0; font-size: 15px; }
.table-footer { display: flex; justify-content: space-between; padding: 15px 23px; border-top: 1px solid #f0f1f6; color: #a0a2b4; font-size: 10px; }
.live-dot { margin-left: 5px; }
.footer-note { display: flex; justify-content: center; gap: 8px; color: #a6a8b7; font-size: 10px; padding-top: 22px; }
.footer-note > span:first-child { color: #8679ed; }
.footer-separator { color: #d0d1dc; }
.empty-table { text-align: center; padding: 35px; }
.empty-table strong { display: block; color: #484c61; margin-top: 8px; }
.empty-table p { margin: 5px 0 0; color: #a1a3b4; }
.back-link { border: 0; background: transparent; color: #777b91; font-size: 12px; margin-bottom: 24px; padding: 0; }
.back-link:hover { color: #665be9; }
.detail-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; gap: 15px; }
.ticket-id { font-size: 10px; color: #8a81e8; font-weight: 700; margin-bottom: 8px; }
.detail-heading h1 { font-size: 23px; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(230px, .85fr); gap: 19px; align-items: start; }
.detail-main, .detail-side { display: flex; flex-direction: column; gap: 19px; min-width: 0; }
.description-panel, .comments-panel, .side-panel { padding: 21px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.description-text { font-size: 12px; color: #777b91; line-height: 1.8; margin: 20px 0; }
.ticket-meta { display: flex; justify-content: space-between; padding: 13px 0; border-top: 1px solid #f0f1f6; font-size: 11px; }
.ticket-meta span { color: #999caf; }
.ticket-meta strong { color: #555970; font-weight: 600; }
.muted { color: #a0a2b4; font-size: 10px; }
.reply-list { margin-top: 15px; }
.reply { display: flex; gap: 11px; padding: 15px 0; border-bottom: 1px solid #f0f1f6; }
.reply-body { flex: 1; min-width: 0; }
.reply-header { display: flex; justify-content: space-between; gap: 10px; }
.reply-header strong { font-size: 11px; color: #484c61; }
.reply-header span { font-size: 10px; color: #a1a3b4; }
.reply-body p { margin: 8px 0 0; color: #777b91; font-size: 11px; line-height: 1.7; }
.no-replies { color: #9a9db0; font-size: 11px; padding: 20px 0; }
.comment-form { margin-top: 18px; }
.comment-form textarea, .create-modal textarea, .create-modal input { width: 100%; border: 1px solid #e5e7ef; border-radius: 8px; padding: 12px; color: #454960; font-size: 11px; outline: none; resize: vertical; background: #fff; }
.comment-form textarea::placeholder, .create-modal textarea::placeholder, .create-modal input::placeholder { color: #b2b4c1; }
.comment-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
.side-panel h2 { margin-bottom: 22px; }
.field-label { display: block; font-size: 10px; font-weight: 700; color: #777b91; margin: 17px 0 8px; }
.side-panel select { width: 100%; max-width: none; font-size: 11px; }
.timeline { display: flex; flex-direction: column; gap: 0; }
.timeline-item { display: flex; gap: 11px; position: relative; padding-bottom: 18px; }
.timeline-item:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 11px; bottom: 0; width: 1px; background: #e6e5f7; }
.timeline-dot { width: 9px; height: 9px; border: 2px solid #8679ed; background: #fff; border-radius: 50%; flex: 0 0 auto; margin-top: 3px; z-index: 1; }
.timeline-item p { color: #5d6178; font-size: 10px; margin-bottom: 5px; }
.timeline-item div span { color: #a2a4b5; font-size: 9px; }
.empty-state { text-align: center; padding: 75px 20px; }
.empty-state h2 { margin-top: 15px; }
.empty-state p { color: #999caf; font-size: 12px; margin-bottom: 20px; }
.empty-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; margin: 0 auto; color: #796ded; background: #f0efff; font-size: 21px; }
.modal-backdrop { position: fixed; inset: 0; background: #20243a75; z-index: 20; display: grid; place-items: center; padding: 20px; overflow-y: auto; }
.create-modal { background: #fff; border-radius: 15px; width: min(100%, 530px); padding: 27px; box-shadow: 0 24px 90px #16152b40; }
.modal-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.modal-heading h2 { font: 800 21px Manrope, sans-serif; margin-bottom: 7px; }
.modal-heading p { color: #9699ac; font-size: 11px; margin: 0; }
.close-button { font-size: 25px; }
.create-modal .field-label { margin-top: 17px; }
.create-modal input { height: 42px; }
.create-modal textarea { display: block; }
.create-modal select { max-width: none; width: 100%; font-size: 11px; padding: 12px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; padding-top: 18px; border-top: 1px solid #f0f1f6; }
.error-content { padding-top: 0; padding-bottom: 0; }
.error-banner { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; border: 1px solid #f2c9c9; background: #fff4f4; color: #994747; border-radius: 9px; padding: 12px 42px 12px 14px; font-size: 12px; }
.error-banner strong { color: #873b3b; }
.error-dismiss { position: absolute; right: 12px; top: 8px; border: 0; background: transparent; color: #994747; font-size: 20px; }
@media (max-width: 1150px) {
  .sidebar { width: 215px; }
  .main-area { margin-left: 215px; }
  .content { padding: 28px 22px; }
  .topbar { padding: 0 22px; }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filters { flex-wrap: wrap; }
  .search-box { flex-basis: 100%; }
}
@media (max-width: 760px) {
  .sidebar { width: 66px; padding: 20px 8px 0; align-items: center; }
  .brand { padding: 0 0 35px; }
  .brand > div:last-child, .workspace-label, .nav-item > span:not(.nav-icon), .upgrade-card, .profile-info, .profile-menu { display: none; }
  .nav-item { justify-content: center; padding: 13px 0; }
  .nav-icon { font-size: 20px; }
  .profile { justify-content: center; }
  .main-area { margin-left: 66px; }
  .topbar { height: 62px; padding: 0 14px; }
  .environment-tag { display: none; }
  .content { padding: 24px 13px; }
  .page-heading { align-items: flex-start; }
  h1 { font-size: 22px; }
  .page-heading p { max-width: 260px; line-height: 1.6; }
  .page-heading > .primary-button { padding: 10px; font-size: 10px; white-space: nowrap; }
  .stats-grid { gap: 9px; }
  .stat-card { padding: 13px; }
  .stat-number { font-size: 24px; }
  .stat-top { gap: 5px; font-size: 10px; }
  .stat-icon { width: 27px; height: 27px; }
  .table-heading { padding: 17px 14px; }
  .filters { padding: 0 14px 15px; }
  .filters select { flex: 1; }
  .table-footer { padding: 13px 14px; }
  .detail-grid { grid-template-columns: 1fr; }
  .detail-heading { flex-direction: column; }
  .detail-heading h1 { overflow-wrap: anywhere; }
  .form-row { grid-template-columns: 1fr; gap: 0; }
}


/* FINAL READABLE THEME OVERRIDES — intentionally placed last so they win */
:root { color-scheme: dark; color: #e8eaf6 !important; background: #11131b !important; }
html, body, #app { background: #11131b !important; color: #e8eaf6 !important; }
body { overflow-x: hidden; }
.app-shell { background: #11131b !important; color: #e8eaf6 !important; }
.sidebar { background: #151722 !important; border-right: 1px solid #30354a !important; color: #e8eaf6 !important; }
.brand-name, .profile-info strong, .sidebar-bottom strong { color: #f1f0ff !important; }
.brand-subtitle, .workspace-label, .profile-info span { color: #929ab5 !important; }
.nav-item { color: #b2b8ce !important; }
.nav-item:hover { background: #24263a !important; color: #e6e1ff !important; }
.nav-item.active { color: #c5bcff !important; background: #292541 !important; }
.nav-count { color: #d4ceff !important; background: #383253 !important; }
.upgrade-card { background: linear-gradient(145deg, #24213a, #1b1d2c) !important; border-color: #34304d !important; color: #e5e0ff !important; }
.upgrade-card strong { color: #e5e0ff !important; }
.upgrade-card p { color: #a4abc4 !important; }
.profile { border-top-color: #30354a !important; }
.main-area { background: #11131b !important; }
.topbar { background: #171923 !important; border-bottom-color: #30354a !important; }
.breadcrumbs { color: #a1a8c0 !important; }
.breadcrumbs strong { color: #edf0fc !important; }
.crumb-divider { color: #59617c !important; }
.topbar-actions > .icon-button { display: none !important; }
.environment-tag { background: #202a2b !important; border-color: #304644 !important; color: #b3e8d0 !important; }
.content { background: #11131b !important; }
.page-heading h1, h1 { color: #f1f0ff !important; }
.page-heading p, .detail-heading p { color: #a1a8c0 !important; }
.eyebrow { color: #a99cff !important; }
.stat-card { background: #191c28 !important; border-color: #30354a !important; color: #e8eaf6 !important; box-shadow: 0 6px 22px rgba(0,0,0,.12) !important; }
.stat-card:hover { background: #202334 !important; border-color: #45405f !important; }
.stat-top { color: #b5bdd4 !important; }
.stat-number { color: #f3f2ff !important; }
.stat-caption { color: #a1a8c0 !important; }
.stat-track { background: #303449 !important; }
.icon-indigo { background: #30294d !important; color: #c2b8ff !important; }
.icon-orange { background: #3b2b25 !important; color: #ffbc85 !important; }
.icon-blue { background: #24344b !important; color: #93c3ff !important; }
.icon-green { background: #203b35 !important; color: #87dfbd !important; }
.panel, .table-panel { background: #191c28 !important; border-color: #30354a !important; color: #e8eaf6 !important; }
.panel h2, .table-heading h2 { color: #f0efff !important; }
.table-heading p { color: #a1a8c0 !important; }
.record-count { background: #25293a !important; border: 1px solid #34384d !important; color: #c4cbe0 !important; }
.search-box { background: #151824 !important; border-color: #373c52 !important; color: #aab2ca !important; }
.search-box input { color: #edf0fc !important; }
.search-box input::placeholder { color: #858eaa !important; }
.search-box kbd { background: #25293a !important; border-color: #3b4057 !important; color: #b9c0d6 !important; }
.filters select, .side-panel select, .create-modal select { background: #151824 !important; border-color: #373c52 !important; color: #e4e7f6 !important; }
.filter-reset, .secondary-button { background: #272b3c !important; border-color: #3b4056 !important; color: #e0e3f2 !important; }
.filter-reset:hover, .secondary-button:hover { background: #32374c !important; }
.primary-button { background: #7866f2 !important; border-color: #8878ff !important; color: #fff !important; }
.primary-button:hover { background: #8878ff !important; }
thead { background: #202333 !important; }
th { background: #202333 !important; color: #b0b8d0 !important; border-color: #30354a !important; }
td { color: #c4cbe0 !important; border-color: #2b3042 !important; }
tbody tr { background: #191c28 !important; }
tbody tr:hover { background: #252a3c !important; }
.ticket-cell strong { color: #f0f1fc !important; }
.ticket-cell div span, .ticket-id { color: #9ba4c0 !important; }
.customer-cell span, .assignee-cell { color: #d0d5e8 !important; }
.date-cell { color: #a1a8c0 !important; }
.ticket-mini-icon, .empty-icon { color: #c2b8ff !important; background: #30294d !important; }
.priority-pill.high, .status-pill.open { color: #ffc18b !important; background: #402f25 !important; }
.priority-pill.medium { color: #f3cf85 !important; background: #403822 !important; }
.priority-pill.low, .status-pill.resolved { color: #8be0bd !important; background: #203c34 !important; }
.status-pill.in-progress { color: #9dc6ff !important; background: #243650 !important; }
.status-pill.closed { color: #c0c5d8 !important; background: #303447 !important; }
.row-arrow { color: #a0a8c2 !important; }
.table-footer { color: #a1a8c0 !important; border-top-color: #30354a !important; }
.footer-note { color: #929ab5 !important; }
.footer-separator { color: #515a76 !important; }
.empty-table strong, .empty-state h2 { color: #e8eaf6 !important; }
.empty-table p, .empty-state p { color: #a1a8c0 !important; }
.back-link { color: #b0a5ff !important; }
.back-link:hover { color: #d4ceff !important; }
.description-panel, .comments-panel, .side-panel { background: #191c28 !important; border-color: #30354a !important; color: #e8eaf6 !important; }
.description-text { color: #c4cbe0 !important; }
.ticket-meta { border-top-color: #30354a !important; }
.ticket-meta span, .muted { color: #a1a8c0 !important; }
.ticket-meta strong { color: #e2e6f5 !important; }
.reply { border-bottom-color: #30354a !important; }
.reply-header strong { color: #edf0fc !important; }
.reply-header span, .no-replies { color: #929ab5 !important; }
.reply-body p { color: #c4cbe0 !important; }
.comment-form textarea, .create-modal textarea, .create-modal input { background: #151824 !important; border-color: #373c52 !important; color: #eef0fb !important; }
.comment-form textarea::placeholder, .create-modal textarea::placeholder, .create-modal input::placeholder { color: #858eaa !important; }
.field-label { color: #b2bad1 !important; }
.timeline-item p { color: #d0d5e8 !important; }
.timeline-item div span { color: #929ab5 !important; }
.timeline-item:not(:last-child)::before { background: #45405f !important; }
.timeline-dot { background: #30294d !important; }
.modal-backdrop { background: rgba(5,7,13,.78) !important; backdrop-filter: blur(7px); }
.create-modal { background: #1b1e2b !important; border: 1px solid #393e54 !important; color: #e8eaf6 !important; box-shadow: 0 24px 80px rgba(0,0,0,.5) !important; }
.modal-heading h2 { color: #f0efff !important; }
.modal-heading p { color: #a1a8c0 !important; }
.close-button { color: #b5bdd4 !important; }
.modal-footer { border-top-color: #30354a !important; }
.error-banner { background: #402529 !important; border-color: #74404a !important; color: #ffc2c8 !important; }
.error-banner strong, .error-dismiss { color: #ffc2c8 !important; }
@media (max-width: 760px) {
  .sidebar { background: #151722 !important; }
  .main-area { background: #11131b !important; }
}



/* ===== Final Supportly UI: readable dark workspace ===== */
:root {
  color-scheme: dark;
  --ui-bg: #11131b;
  --ui-sidebar: #151722;
  --ui-panel: #1b1e2b;
  --ui-panel-2: #222638;
  --ui-border: #34394f;
  --ui-text: #eef0fc;
  --ui-muted: #aab1c9;
  --ui-soft: #8992ae;
  --ui-accent: #9b8cff;
}
html, body, #app { width:100%; min-width:360px; min-height:100%; margin:0; background:var(--ui-bg) !important; }
body { color:var(--ui-text) !important; overflow-x:hidden; }
#app { max-width:none !important; padding:0 !important; text-align:left !important; border:0 !important; }
.app-shell { width:100%; min-height:100vh; background:var(--ui-bg) !important; }
.sidebar { width:248px !important; padding:26px 16px 16px !important; background:var(--ui-sidebar) !important; border-right:1px solid var(--ui-border) !important; overflow-y:auto; }
.brand { padding:3px 8px 40px !important; }
.brand-name { color:#f3f1ff !important; }
.brand-subtitle, .workspace-label { color:#8f97b2 !important; }
.nav-item { color:#b0b6cd !important; background:transparent !important; }
.nav-item:hover { color:#eeeaff !important; background:#24273a !important; }
.nav-item.active { color:#c9c0ff !important; background:#2a2644 !important; border:1px solid #3a3459 !important; }
.nav-count { color:#d4ceff !important; background:#393352 !important; }
.sidebar-bottom { display:flex !important; flex-direction:column !important; gap:14px !important; width:100% !important; margin-top:auto !important; }
.upgrade-card { width:100% !important; margin:0 !important; padding:18px 14px !important; border:1px solid #38334f !important; border-radius:13px !important; background:linear-gradient(145deg,#24213a,#1b1d2c) !important; text-align:center; }
.upgrade-card strong { color:#e7e2ff !important; }
.upgrade-card p { color:#a5abc3 !important; }
.profile { display:flex !important; align-items:center !important; width:100% !important; min-width:0 !important; padding:14px 2px 4px !important; border-top:1px solid #303448 !important; }
.profile-info { min-width:0; }
.profile-info strong { color:#edf0fc !important; }
.profile-info span { color:#969fba !important; }
.profile-menu { color:#aab1c9 !important; }
.main-area { width:calc(100% - 248px) !important; min-width:0 !important; margin-left:248px !important; background:var(--ui-bg) !important; }
.topbar { height:70px !important; padding:0 clamp(20px,3vw,44px) !important; background:#171a26 !important; border-bottom:1px solid var(--ui-border) !important; }
.breadcrumbs { color:#aab1c9 !important; }
.breadcrumbs strong { color:#eef0fc !important; }
.topbar-actions .icon-button { display:none !important; }
.environment-tag { color:#9ce0c2 !important; background:#202c2b !important; border:1px solid #365148 !important; }
.content { width:100% !important; max-width:1600px !important; margin:0 auto !important; padding:36px clamp(20px,3vw,44px) 28px !important; }
.page-heading { display:flex; align-items:center; justify-content:space-between; gap:22px; margin-bottom:28px !important; }
.page-heading h1 { color:#f2f0ff !important; font-family:Manrope,'DM Sans',sans-serif !important; font-size:clamp(27px,2.2vw,34px) !important; font-weight:800 !important; letter-spacing:-1px !important; line-height:1.25 !important; margin:0 !important; }
.page-heading p { color:#aab1c9 !important; font-size:13px !important; margin-top:9px !important; }
.eyebrow { color:#a99cff !important; font-weight:800 !important; letter-spacing:1.8px !important; }
.primary-button { color:#fff !important; background:linear-gradient(135deg,#8978ff,#6d5ae8) !important; border:1px solid #9587ff !important; box-shadow:0 6px 18px #6e5bea30 !important; }
.primary-button:hover { background:linear-gradient(135deg,#9a8bff,#7a68f1) !important; }
.secondary-button { color:#e0e3f3 !important; background:#292d40 !important; border:1px solid #424861 !important; }
.secondary-button:hover { background:#34394f !important; }
.stats-grid { display:grid !important; grid-template-columns:repeat(4,minmax(0,1fr)) !important; gap:16px !important; margin-bottom:24px !important; }
.stat-card { min-width:0; padding:21px 20px 18px !important; background:linear-gradient(145deg,#1d2030,#191c28) !important; border:1px solid var(--ui-border) !important; border-radius:15px !important; color:var(--ui-text) !important; box-shadow:0 8px 22px #0002 !important; }
.stat-top { color:#b7bed4 !important; }
.stat-top > span:first-child { color:#b7bed4 !important; font-size:12px !important; font-weight:600; }
.stat-number { color:#f2f0ff !important; font-size:32px !important; font-weight:800 !important; }
.stat-caption { color:#9aa3be !important; font-size:10px !important; }
.stat-track { background:#34394f !important; }
.icon-indigo { color:#c0b5ff !important; background:#30294d !important; }
.icon-orange { color:#ffc18b !important; background:#3b2b25 !important; }
.icon-blue { color:#9dc6ff !important; background:#24344b !important; }
.icon-green { color:#8be0bd !important; background:#203b35 !important; }
.panel, .table-panel { background:var(--ui-panel) !important; border:1px solid var(--ui-border) !important; border-radius:15px !important; color:var(--ui-text) !important; box-shadow:0 10px 28px #0002 !important; overflow:hidden; }
.table-heading { padding:23px 24px 18px !important; background:var(--ui-panel) !important; }
.table-heading h2, .panel-heading h2 { color:#f0efff !important; font-size:15px !important; font-weight:800 !important; }
.table-heading p, .panel-heading p { color:#a1a9c2 !important; font-size:11px !important; }
.record-count { color:#c5cbe0 !important; background:#282c40 !important; border:1px solid #3a4058 !important; }
.filters { display:flex; gap:10px; padding:0 24px 18px !important; background:var(--ui-panel) !important; border-bottom:1px solid #30354a !important; }
.search-box { background:#141722 !important; border:1px solid #3a4058 !important; color:#aab1c9 !important; }
.search-box input { color:#f0f1fb !important; background:transparent !important; }
.search-box input::placeholder { color:#8c95b0 !important; }
.search-box kbd { color:#c0c6dc !important; background:#292d40 !important; border-color:#414760 !important; }
.filters select, .side-panel select, .create-modal select { color:#e4e7f6 !important; background:#171a27 !important; border:1px solid #3a4058 !important; }
.filter-reset { color:#d7dcef !important; background:#292d40 !important; border:1px solid #424861 !important; }
.table-scroll { width:100%; overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
thead { background:#25293b !important; }
th { color:#aeb6cf !important; background:#25293b !important; border-bottom:1px solid #3a4055 !important; font-size:9px !important; letter-spacing:1px; }
td { color:#dce1f3 !important; border-bottom:1px solid #30354a !important; }
tbody tr { background:#1b1e2b !important; }
tbody tr:hover { background:#25293b !important; }
.ticket-cell strong, .ticket-title, .customer-cell span { color:#f0f1fc !important; }
.ticket-id, .ticket-meta, .assignee-cell, .date-cell { color:#a0a9c4 !important; }
.priority-pill, .status-pill { font-weight:700 !important; border:1px solid transparent !important; }
.priority-pill.high, .status-pill.open { color:#ffc18b !important; background:#402f25 !important; border-color:#563a2b !important; }
.priority-pill.medium { color:#f3cf85 !important; background:#403822 !important; border-color:#57492b !important; }
.priority-pill.low, .status-pill.resolved { color:#8be0bd !important; background:#203c34 !important; border-color:#2b5145 !important; }
.status-pill.in-progress { color:#9dc6ff !important; background:#243650 !important; border-color:#30496b !important; }
.status-pill.closed { color:#c0c6d9 !important; background:#303447 !important; border-color:#42475e !important; }
.empty-state { color:#e5e8f7 !important; }
.empty-state h3 { color:#e8eaf7 !important; }
.empty-state p { color:#a3abc4 !important; }
.empty-icon { color:#b9adff !important; background:#30294d !important; border:1px solid #443b68 !important; }
.table-footer { color:#9ca5c0 !important; background:#191c28 !important; border-top:1px solid #30354a !important; }
.footer-note { color:#8992ae !important; }
.detail-grid { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(260px,.9fr); gap:20px; }
.description-panel, .comments-panel, .side-panel { background:var(--ui-panel) !important; border-color:var(--ui-border) !important; color:var(--ui-text) !important; }
.description-text, .reply-body { color:#d2d7e9 !important; line-height:1.8; }
.field-label { color:#b8bfd5 !important; }
.reply { background:#222638 !important; border:1px solid #363c52 !important; }
.reply-header strong, .timeline-item strong { color:#eef0fc !important; }
.reply-header span, .timeline-item p, .timeline-item span { color:#a6aec7 !important; }
.comment-form textarea, .create-modal textarea, .create-modal input { color:#eef0fc !important; background:#141722 !important; border:1px solid #3a4058 !important; }
.comment-form textarea::placeholder, .create-modal textarea::placeholder, .create-modal input::placeholder { color:#8992ae !important; }
.modal-backdrop { background:#070910cc !important; backdrop-filter:blur(7px); }
.create-modal { color:#eef0fc !important; background:#1b1e2b !important; border:1px solid #3a4055 !important; box-shadow:0 24px 80px #0009 !important; }
.modal-heading h2, .create-modal label { color:#eef0fc !important; }
.modal-heading p { color:#aab1c9 !important; }
.modal-footer { border-top-color:#34394f !important; }
.error-banner { color:#ffc2c8 !important; background:#402529 !important; border-color:#74404a !important; }

@media (max-width:1200px) {
  .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .detail-grid { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:760px) {
  .sidebar { width:76px !important; padding:20px 9px 12px !important; }
  .brand { justify-content:center; padding:0 0 30px !important; }
  .brand > div:last-child, .workspace-label, .nav-item > span:not(.nav-icon), .upgrade-card, .profile-info, .profile-menu { display:none !important; }
  .nav-item { justify-content:center; padding:13px 8px !important; }
  .nav-count { display:none; }
  .main-area { width:calc(100% - 76px) !important; margin-left:76px !important; }
  .topbar { height:62px !important; padding:0 14px !important; }
  .content { padding:24px 15px !important; }
  .page-heading { align-items:flex-start; flex-direction:column; gap:16px; }
  .stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:11px !important; }
  .stat-card { padding:15px !important; }
  .stat-number { font-size:27px !important; }
  .filters { flex-wrap:wrap; padding:0 15px 16px !important; }
  .search-box { flex:1 1 100%; min-width:100%; }
  .filters select { flex:1; min-width:0; }
  .table-heading { padding:19px 15px 15px !important; }
  .table-footer { align-items:flex-start; flex-direction:column; gap:8px; }
  .detail-grid { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:430px) {
  .stats-grid { grid-template-columns:minmax(0,1fr) !important; }
  .record-count { display:none; }
}


.customer-settings-page .page-heading{margin-bottom:20px}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.settings-card{padding:18px}.settings-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--border,#2b3040)}.settings-card-head>div{display:flex;align-items:center;gap:11px}.settings-card-head h2{margin:0;font-size:14px}.settings-card-head p{margin:4px 0 0;color:#7c8498;font-size:9px}.settings-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:rgba(126,103,239,.13);color:#9d8bff}.settings-badge,.connection-dot{padding:5px 8px;border-radius:8px;font-size:8px;font-weight:800}.settings-badge{background:rgba(74,190,125,.12);color:#79d49f}.connection-dot{background:rgba(74,190,125,.12);color:#70cf96}.settings-row{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}.settings-row span{color:#7d8497;font-size:9px}.settings-row strong{max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}.settings-toggle{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer}.settings-toggle strong,.settings-toggle span{display:block}.settings-toggle strong{font-size:9px}.settings-toggle span{margin-top:3px;color:#757d91;font-size:8px}.settings-toggle input{width:17px;height:17px;accent-color:#7e67ef}.settings-save,.settings-signout{width:100%;margin-top:15px}.danger-card{border-color:rgba(255,111,124,.18)}@media(max-width:900px){.settings-grid{grid-template-columns:1fr}}


/* CUSTOMER 5-FEATURE PACK */
.heading-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
.customer-feature-strip { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:11px; margin:-8px 0 24px; }
.feature-card { border:1px solid #e7e8f0; background:#fff; border-radius:12px; padding:14px; display:flex; align-items:center; gap:10px; text-align:left; color:#555a70; min-height:68px; transition:transform .18s,border-color .18s,box-shadow .18s; }
button.feature-card:hover { transform:translateY(-2px); border-color:#c9c5ff; box-shadow:0 10px 24px #6157d612; }
.feature-card:disabled { opacity:.55; transform:none; }
.feature-icon { width:34px; height:34px; display:grid; place-items:center; flex:0 0 auto; border-radius:9px; background:#f0efff; color:#6c61dd; font-size:16px; }
.feature-card > span:last-child { display:flex; flex-direction:column; gap:4px; min-width:0; }
.feature-card strong { font-size:10px; color:#454960; }
.feature-card small { font-size:9px; line-height:1.35; color:#9b9eaf; }
.static-card { cursor:default; }
.detail-heading-actions { display:flex; align-items:center; gap:9px; flex-wrap:wrap; justify-content:flex-end; }
.favorite-button { border:0; background:transparent; color:#9ba0b4; font-size:18px; padding:2px; line-height:1; }
.favorite-button.saved { color:#f0b44a; }
.draft-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #e8e5ff; background:#f8f7ff; color:#6d65a8; padding:10px 12px; border-radius:9px; font-size:10px; margin-bottom:14px; }
.draft-clear { border:0; background:transparent; color:#695ed9; font-size:10px; font-weight:700; padding:0; }
.template-picker { margin-bottom:3px; }
.template-label { margin-top:0 !important; }
.template-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.template-button { display:flex; align-items:center; gap:8px; border:1px solid #e7e8ef; background:#fafaff; border-radius:9px; padding:9px 10px; color:#565a70; text-align:left; }
.template-button:hover { border-color:#c9c5ff; background:#f4f2ff; }
.template-button span { font-size:15px; }
.template-button strong { font-size:9px; }
@media (max-width:1250px) { .customer-feature-strip { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:760px) { .customer-feature-strip { grid-template-columns:1fr; } .heading-actions { width:100%; justify-content:flex-start; } .page-heading { flex-wrap:wrap; } .detail-heading-actions { justify-content:flex-start; } .template-grid { grid-template-columns:1fr; } }

/* dark theme support for customer features */
.customer-feature-strip .feature-card { background:#1b1e2b !important; border-color:#353a50 !important; color:#dfe2f2 !important; }
.customer-feature-strip .feature-card strong { color:#eef0fb !important; }
.customer-feature-strip .feature-card small { color:#99a2bd !important; }
.customer-feature-strip .feature-icon { background:#272541 !important; color:#a79bff !important; }
.draft-banner { background:#24223a !important; border-color:#484368 !important; color:#c5c0ef !important; }
.draft-clear { color:#afa4ff !important; }
.template-button { background:#171a27 !important; border-color:#393f57 !important; color:#e5e8f7 !important; }
.template-button:hover { background:#20243a !important; border-color:#6860a8 !important; }
.favorite-button { color:#8d96b2 !important; }
.favorite-button.saved { color:#f2bd57 !important; }

</style>
