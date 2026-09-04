import { getAdminToken } from '../contexts/AdminContext'

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

function hdrs() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAdminToken()}`,
  }
}

async function req(method, path, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: hdrs(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    console.error('[AdminApi] 네트워크 오류:', method, `${BASE}${path}`, networkErr)
    throw new Error(`네트워크 연결 오류: ${networkErr.message}`)
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    let msg = e.message ?? `오류 ${res.status}`
    if (typeof msg === 'string' && msg.startsWith('{')) {
      try {
        const inner = JSON.parse(msg)
        msg = inner.details ?? inner.message ?? msg
      } catch { /* keep original msg */ }
    }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const adminApi = {
  createEvent: (data) => req('POST', '/admin/events', data),
  updateEvent: (id, data) => req('PATCH', `/admin/events/${encodeURIComponent(id)}`, data),
  deleteEvent: (id) => req('DELETE', `/admin/events/${encodeURIComponent(id)}`),
}
