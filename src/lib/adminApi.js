import { getAdminToken, TOKEN_KEY } from '../contexts/AdminContext'

const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

const ERROR_MESSAGES = {
  not_found: '대상을 찾을 수 없습니다. 다른 곳에서 이미 삭제됐을 수 있습니다.',
  internal_error: '서버 오류로 저장하지 못했습니다. 입력값을 확인하고 다시 시도해주세요.',
  invalid_json: '요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.',
  invalid_url: '주소는 http:// 또는 https:// 로 시작해야 합니다. (포스터·예매·공식사이트·배치도)',
  not_configured: '서버에 관리자 설정이 되어 있지 않습니다. (Worker 시크릿 확인 필요)',
  invalid_upload: '올릴 수 없는 파일입니다. JPG·PNG·WebP·GIF 이미지만 됩니다.',
  file_too_large: '파일이 너무 큽니다. 12MB 이하로 줄여서 올려주세요.',
  upload_failed: '이미지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
  invalid_status: '알 수 없는 검수 상태입니다. 새로고침 후 다시 시도해주세요.',
  too_many_reports: '제보를 너무 자주 보내셨습니다. 잠시 후 다시 시도해주세요.',
  invalid_report: '제보 내용을 확인해주세요.',
  invalid_message: '내용을 5자 이상 2000자 이하로 적어주세요.',
  invalid_contact: '연락처가 너무 깁니다. 200자 이하로 적어주세요.',
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

// 이미지 파일 업로드. 본문이 JSON이 아니라 바이트라 req()를 쓸 수 없다.
// 파일 이름은 서버가 정하므로 여기서 보내지 않는다.
async function upload(blob, prefix) {
  let res
  try {
    res = await fetch(`${BASE}/admin/uploads?prefix=${encodeURIComponent(prefix)}`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type,
        'Authorization': `Bearer ${getAdminToken()}`,
      },
      body: blob,
    })
  } catch (networkErr) {
    throw new Error(`네트워크 연결 오류: ${networkErr.message}`)
  }
  if (!res.ok) {
    if (res.status === 401) {
      try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* 시크릿 모드 등, 무시 */ }
      throw new Error('관리자 세션이 만료됐습니다. 다시 로그인해주세요.')
    }
    const { error: code } = await res.json().catch(() => ({}))
    throw new Error(ERROR_MESSAGES[code] ?? `오류 ${res.status}`)
  }
  const { url } = await res.json()
  return url
}

export const adminApi = {
  createEvent: (data) => req('POST', '/admin/events', data),
  updateEvent: (id, data) => req('PATCH', `/admin/events/${encodeURIComponent(id)}`, data),
  deleteEvent: (id) => req('DELETE', `/admin/events/${encodeURIComponent(id)}`),

  createBooth: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/booths`, data),
  updateBooth: (id, data) => req('PATCH', `/admin/booths/${encodeURIComponent(id)}`, data),
  deleteBooth: (id) => req('DELETE', `/admin/booths/${encodeURIComponent(id)}`),

  // 부스 항목은 booth_id를 body로 보내지만 event_id는 URL에서 서버가 넣는다 —
  // 다른 하위 목록과 같은 라우트 패턴이라 Worker 코드를 새로 만들 필요가 없다.
  createBoothItem: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/booth_items`, data),
  updateBoothItem: (id, data) => req('PATCH', `/admin/booth_items/${encodeURIComponent(id)}`, data),
  deleteBoothItem: (id) => req('DELETE', `/admin/booth_items/${encodeURIComponent(id)}`),

  createPerformer: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/performers`, data),
  updatePerformer: (id, data) => req('PATCH', `/admin/performers/${encodeURIComponent(id)}`, data),
  deletePerformer: (id) => req('DELETE', `/admin/performers/${encodeURIComponent(id)}`),

  // 무대는 장소(stages)와 시간표(stage_slots) 두 단계다. 슬롯은 stage_id를 body로
  // 보내지만 event_id는 booth_items와 똑같이 URL에서 서버가 넣는다.
  createStage: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/stages`, data),
  updateStage: (id, data) => req('PATCH', `/admin/stages/${encodeURIComponent(id)}`, data),
  deleteStage: (id) => req('DELETE', `/admin/stages/${encodeURIComponent(id)}`),

  createStageSlot: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/stage_slots`, data),
  updateStageSlot: (id, data) => req('PATCH', `/admin/stage_slots/${encodeURIComponent(id)}`, data),
  deleteStageSlot: (id) => req('DELETE', `/admin/stage_slots/${encodeURIComponent(id)}`),

  createCosplayer: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/cosplayers`, data),
  updateCosplayer: (id, data) => req('PATCH', `/admin/cosplayers/${encodeURIComponent(id)}`, data),
  deleteCosplayer: (id) => req('DELETE', `/admin/cosplayers/${encodeURIComponent(id)}`),

  // 상세페이지 탭 구성. key가 'booths'|'stage'|'goods'|'cosplay'면 기본 탭을 덮어쓰고,
  // 그 외 슬러그면 새 탭이 된다(builtin 값이 둘을 가른다).
  createTab: (eventId, data) => req('POST', `/admin/events/${encodeURIComponent(eventId)}/tabs`, data),
  updateTab: (id, data) => req('PATCH', `/admin/tabs/${encodeURIComponent(id)}`, data),
  deleteTab: (id) => req('DELETE', `/admin/tabs/${encodeURIComponent(id)}`),

  // 크롤러 자동 갱신을 다시 켠다. updateEvent가 admin_edited_at을 찍고 나면 크롤러가
  // 그 행사를 통째로 건너뛰는데, 지금까지 되돌릴 방법이 없었다.
  unlockEvent: (id) => req('POST', `/admin/events/${encodeURIComponent(id)}/unlock`),

  // 뉴스 검수. 예전엔 브라우저가 Supabase를 직접 부르고 RLS가 구글 로그인 이메일로
  // 막았는데, 그러느라 관리 기능 중 이것만 로그인이 달랐다. 이제 다른 것들과 같은 길로 간다.
  listDrafts: (status = 'pending') => req('GET', `/admin/drafts?status=${encodeURIComponent(status)}`),
  // 승인이 실패하면 트리거가 그 draft만 rejected로 돌리고 사유를 적는다 — 그래서
  // 요청이 성공해도 돌아온 행의 status가 rejected일 수 있다. 바뀐 행을 그대로 돌려준다.
  updateDraft: (id, data) => req('PATCH', `/admin/drafts/${encodeURIComponent(id)}`, data),

  // 방문자 제보 검수. 목록에는 대상 행사 제목이 함께 온다(제보만 봐서는 어느 행사
  // 얘기인지 id밖에 안 보인다). 넣는 쪽은 관리자가 아니라 방문자라 여기 없다 — reportApi.
  listReports: (status = 'open') => req('GET', `/admin/reports?status=${encodeURIComponent(status)}`),
  updateReport: (id, data) => req('PATCH', `/admin/reports/${encodeURIComponent(id)}`, data),

  // 감지 알림 확인 처리. "봤다"만 기록하므로 body가 없다.
  ackWatch: (key) => req('POST', `/admin/watches/${encodeURIComponent(key)}/ack`),

  // prefix는 저장 경로의 앞칸 — Worker가 허용 목록으로 검사한다.
  uploadImage: (blob, prefix = 'items') => upload(blob, prefix),
}
