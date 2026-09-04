import { getAdminToken } from '../contexts/AdminContext'

const BASE = import.meta.env.VITE_ADMIN_API_URL ?? ''

function hdrs() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAdminToken()}`,
  }
}

async function req(method, path, body) {
  if (!BASE) throw new Error('관리자 API URL이 설정되지 않았습니다 (VITE_ADMIN_API_URL 환경변수 확인)')
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
