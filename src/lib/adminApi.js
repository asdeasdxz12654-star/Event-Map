import { getAdminToken, TOKEN_KEY } from '../contexts/AdminContext'

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
    if (res.status === 401) {
      // 세션 토큰이 만료됐거나 무효함 — 다음 로그인 시도가 확실히 새로 인증하도록 지운다.
      try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* 시크릿 모드 등, 무시 */ }
      throw new Error('관리자 세션이 만료됐습니다. 다시 로그인해주세요.')
    }
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

  createBooth: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/booths`, data),
  updateBooth: (id, data) => req('PATCH', `/admin/booths/${encodeURIComponent(id)}`, data),
  deleteBooth: (id) => req('DELETE', `/admin/booths/${encodeURIComponent(id)}`),

  createPerformer: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/performers`, data),
  updatePerformer: (id, data) => req('PATCH', `/admin/performers/${encodeURIComponent(id)}`, data),
  deletePerformer: (id) => req('DELETE', `/admin/performers/${encodeURIComponent(id)}`),
}
