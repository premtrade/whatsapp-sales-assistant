const API = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    request<{ data: { token: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then(r => r.data.token),
  getDashboard: () =>
    request<{ data: any }>('/stats/dashboard').then(r => r.data),
  getConversations: (page = 1) =>
    request<{ data: any }>(`/conversations?page=${page}`).then(r => r.data),
  getHandoffs: () =>
    request<{ data: any[] }>('/handoffs/pending').then(r => r.data),
  getQuotes: (page = 1) =>
    request<{ data: any[] }>(`/quotes?page=${page}`).then(r => r.data),
  getAppointments: (page = 1) =>
    request<{ data: any[] }>(`/appointments?page=${page}`).then(r => r.data),
  getMessages: (conversationId: string) =>
    request<{ data: any[] }>(`/messages/${conversationId}`).then(r => r.data),
}
