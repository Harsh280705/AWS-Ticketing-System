
const API_BASE_URL = 'http://localhost:3000'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.error || 'API request failed'
    )
  }

  return data
}

export const ticketApi = {
  list() {
    return request('/tickets')
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
  }
}
