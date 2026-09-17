// 저장되기 전에 막아야 하는 값들.
import { HttpError } from './http.js'

// 화면에서 <a href>·<img src>로 그대로 나가는 컬럼들. 여기에 http(s)가 아닌 값이 들어가면
// 그 값이 곧 링크가 된다(javascript:, data: 등). DB에 들어가기 전에 막는 게 제일 싸다 —
// 저장되고 나면 프론트·미리보기 함수·ICS 내보내기까지 전부가 그 값을 쓰게 된다.
export const URL_COLUMNS = [
  'poster_url', 'ticket_url', 'website', 'floor_plan_url', 'image_url',
  'photo_url', 'sns_url',
]

export function isHttpUrl(value) {
  if (typeof value !== 'string' || value === '') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// 값이 비어 있으면(null·빈 문자열) "지우기"라 그대로 통과시킨다. 값이 있는데 http(s)가
// 아니면 400으로 거절한다 — 조용히 버리면 관리자는 저장된 줄 알고 화면을 떠난다.
export function assertUrlColumns(data) {
  for (const key of URL_COLUMNS) {
    const value = data[key]
    if (value == null || value === '') continue
    if (!isHttpUrl(value)) throw new HttpError(400, 'invalid_url')
  }
  return data
}

// 아는 값만 통과시킨다. 상태 문자열은 PostgREST 쿼리에 그대로 들어가므로,
// 목록에 없는 값은 여기서 끊는다.
export function assertOneOf(value, allowed, code = 'invalid_status') {
  if (!allowed.includes(value)) throw new HttpError(400, code)
  return value
}
