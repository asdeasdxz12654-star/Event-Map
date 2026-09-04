import { getAdminToken } from '../contexts/AdminContext'

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

function hdrs() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAdminToken()}`,
  }
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: hdrs(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.message ?? `오류 ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

export const adminApi = {
  createEvent: (data) => req('POST', '/admin/events', data),
  updateEvent: (id, data) => req('PATCH', `/admin/events/${encodeURIComponent(id)}`, data),
  deleteEvent: (id) => req('DELETE', `/admin/events/${encodeURIComponent(id)}`),
}
