// 크롤러 여러 곳에서 똑같이 쓰던 잡동사니를 모아둔 곳.
// (sleep 7벌, User-Agent 6벌, HTML 텍스트 변환 4벌이 파일마다 복사돼 있었다.)

// 공개 페이지를 받을 때 쓰는 User-Agent. 정체를 밝히는 편이 차단당할 때 원인을 찾기 쉽고,
// 실제로 킨텍스 오픈API는 User-Agent가 없으면 WAF에 막힌다.
export const UA = 'Mozilla/5.0 (compatible; EventMapCrawler/1.0; +https://github.com)'

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 공개 HTML 페이지를 받아 문자열로 돌려준다. 응답이 안 오는 사이트에 매달리지 않도록
// 반드시 시간 제한을 둔다 — 크롤은 하루 한 번이라 한 번 멈추면 그날 수집이 통째로 빈다.
export async function fetchHtml(url, { timeoutMs = 15_000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

export function decodeEntities(text = '') {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// HTML을 사람이 읽는 텍스트로. 태그 자리는 공백으로 바꾼다 — 붙여서 지우면 서로 다른
// 줄의 글자가 한 단어로 붙어버린다("...개최</p><p>장소..." -> "개최장소").
//
// 주의: 검색 결과 제목을 다루는 poster-filter.mjs / naver-local.mjs는 태그를 공백 없이
// 지운다. 네이버·구글이 일치한 단어를 <b>로 감싸 주는데("코믹<b>월드</b>"), 거기에
// 공백을 넣으면 "코믹 월드"가 돼서 행사명 대조가 어긋나기 때문이다. 그래서 그 두 곳은
// 이 함수를 쓰지 않는다.
export function htmlToText(html = '') {
  return decodeEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  )
}
