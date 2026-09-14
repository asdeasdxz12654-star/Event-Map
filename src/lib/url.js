// 외부에서 들어온 주소를 화면에 내보내기 전에 거르는 곳.
//
// 왜 필요한가
//   events.ticket_url / website / poster_url은 사람이 입력한 값이 아니다. 크롤러가 뉴스
//   기사를 LLM(Groq)에 넣어 뽑아낸 문자열이 event_drafts를 거쳐 자동 승인으로 events까지
//   들어온다(crawler/src/crawl.mjs). 그 값이 검증 없이 <a href>·<img src>에 꽂히면
//   "모델이 만들어낸 문자열"이 그대로 링크가 된다 — javascript:, data:, 혹은 엉뚱한 스킴.
//   React 19는 javascript: href를 막아주지만, 그건 마지막 그물이지 설계가 아니다.
//
//   Worker(관리자 입력)·크롤러(저장 직전)·DB 트리거(승인 시점)에서도 같은 검사를 한다.
//   여기는 "이미 저장돼 있는 옛 데이터"까지 걸러내는 마지막 층이다.
export function httpUrl(value) {
  if (typeof value !== 'string' || value === '') return null
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : null
  } catch {
    return null // 상대 경로·깨진 문자열 등 URL로 파싱조차 안 되는 값
  }
}
