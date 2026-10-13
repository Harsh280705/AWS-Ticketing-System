// Token-aware API client. In local demo mode no token is attached and the
// backend falls back to the labelled demo user. Against the deployed API
// Gateway, the Cognito JWT authorizer requires `Authorization: Bearer <jwt>`.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let tokenProvider = null

// Registered once at startup (see views/Dashboard.vue) to avoid import cycles
// between the api client and the auth module.
export function setAuthTokenProvider(fn) {
  tokenProvider = typeof fn === 'function' ? fn : null
}

async function authHeaders() {
  if (!tokenProvider) return {}
  try {
    const token = await tokenProvider()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
        ...options.headers
      }
    })
  } catch (cause) {
    const err = new Error(`Could not reach the API (${path}). Check your connection and VITE_API_URL.`)
    err.code = 'NETWORK_ERROR'
    err.cause = cause
    throw err
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const serverMessage = data?.error?.message || data?.error
    const message = serverMessage || `API request failed (${response.status})`
    const err = new Error(message)
    err.status = response.status
    err.code = data?.error?.code
    err.path = path
    throw err
  }

  return data
}

function toQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const ticketApi = {
  list(params = {}) {
    return request(`/tickets${toQuery(params)}`)
  },

  create(ticket) {
    return request('/tickets', {
      method: 'POST',
      body: JSON.stringify(ticket)
    })
  },

  get(id) {
    return request(`/tickets/${encodeURIComponent(id)}`)
  },

  update(id, changes) {
    return request(`/tickets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(changes)
    })
  },

  addComment(id, text) {
    return request(`/tickets/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text })
    })
  },

  comments(id) {
    return request(`/tickets/${encodeURIComponent(id)}/comments`)
  },

  presignedUrl({ filename, contentType, fileSize }) {
    return request('/tickets/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, fileSize })
    })
  },

  // Browser-direct upload: pre-signed S3 PUT in production, clearly-labeled
  // local mock URL (local disk, never AWS) in development. When ticketId is
  // given the local backend associates the file with the ticket on PUT.
  async uploadAttachment(file, ticketId) {
    if (!(file instanceof File)) throw new Error('Select a file to upload.')
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('File must be 5 MB or smaller.')
    const { uploadUrl, key, mock } = await this.presignedUrl({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size
    })
    const target = ticketId ? `${uploadUrl}?ticketId=${encodeURIComponent(ticketId)}` : uploadUrl
    const put = await fetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    })
    if (!put.ok) throw new Error('Upload failed. Please try again.')
    return { key, mock: !!mock }
  }
}
