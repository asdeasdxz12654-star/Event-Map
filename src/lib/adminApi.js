import { getAdminToken, TOKEN_KEY } from '../contexts/AdminContext'

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

const ERROR_MESSAGES = {
  not_found: '대상을 찾을 수 없습니다. 다른 곳에서 이미 삭제됐을 수 있습니다.',
  internal_error: '서버 오류로 저장하지 못했습니다. 입력값을 확인하고 다시 시도해주세요.',
}

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
    // Worker는 에러 코드만 내려준다 — DB 원문 메시지(테이블/컬럼/제약 이름이 그대로
    // 들어있음)는 Worker 로그에만 남기고 응답에는 싣지 않기 때문이다. 코드별 안내
    // 문구는 여기서 만든다.
    const { error: code } = await res.json().catch(() => ({}))
    throw new Error(ERROR_MESSAGES[code] ?? `오류 ${res.status}`)
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
