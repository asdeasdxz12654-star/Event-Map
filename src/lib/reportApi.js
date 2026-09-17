const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'

// 서버가 내려주는 코드 -> 사람이 읽을 문구.
// adminApi와 따로 두는 이유: 이 화면을 보는 사람은 관리자가 아니라 방문자다.
// "Worker 시크릿 확인 필요" 같은 문구를 방문자에게 보여줄 이유가 없다.
const MESSAGES = {
  too_many_reports: '제보를 너무 자주 보내셨습니다. 잠시 후 다시 시도해주세요.',
  invalid_message: '내용을 5자 이상 2000자 이하로 적어주세요.',
  invalid_contact: '연락처가 너무 깁니다. 200자 이하로 적어주세요.',
  invalid_report: '보낼 수 없는 형식입니다. 새로고침 후 다시 시도해주세요.',
  // 없는 행사 id로 보낸 경우. 예전엔 Worker가 이것도 invalid_report로 뭉갰는데,
  // 지금은 DB 제약 위반을 한 곳에서 번역하면서 따로 온다(workers lib/db.js).
  invalid_reference: '그 행사를 찾을 수 없습니다. 목록이 바뀌었을 수 있으니 새로고침 후 다시 시도해주세요.',
  invalid_json: '보낼 수 없는 형식입니다. 새로고침 후 다시 시도해주세요.',
  internal_error: '지금은 접수가 안 됩니다. 잠시 후 다시 시도해주세요.',
}

// 방문자가 보내는 제보 · 정보 오류 신고.
//
// adminApi를 안 쓰는 이유: 저쪽은 모든 요청에 관리자 토큰을 붙인다. 여기는 로그인이
// 없는 사람이 쓰는 길이라 토큰이 없고, 있어서도 안 된다.
//
// 스팸은 Worker가 IP 기준 횟수로 막는다(1시간에 5건). 캡차는 넣지 않았다 —
// 방문자가 얼마나 되는지도 모르는 상태에서 캡차부터 세우면 정상 제보의 문턱만 올린다.
export async function sendReport({ kind, eventId = null, message, contact = '' }) {
  let res
  try {
    res = await fetch(`${BASE}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        event_id: eventId,
        message,
        contact: contact.trim() || null,
      }),
    })
  } catch (err) {
    throw new Error(`네트워크 연결 오류: ${err.message}`)
  }

  if (!res.ok) {
    // 429는 Retry-After로 "얼마나 기다려야 하는지"까지 알려준다 — 그냥 "나중에"라고만
    // 하면 언제 다시 눌러야 할지 몰라 계속 눌러보게 된다.
    if (res.status === 429) {
      const mins = Math.ceil(Number(res.headers.get('Retry-After') ?? 3600) / 60)
      throw new Error(`제보를 너무 자주 보내셨습니다. ${mins}분 뒤에 다시 시도해주세요.`)
    }
    const { error: code } = await res.json().catch(() => ({}))
    throw new Error(MESSAGES[code] ?? '제보를 보내지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
  return true
}
