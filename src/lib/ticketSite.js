// 예매 URL의 호스트명에서 사람이 읽기 좋은 사이트 이름을 뽑아낸다.
// 별도 컬럼 없이 ticket_url 하나만 있어도 "어디서 예매하는지" 보여줄 수 있게 하기 위함.
const KNOWN_SITES = [
  [/interpark\.com$/, '인터파크'],
  [/yes24\.com$/, '예스24'],
  [/melon\.com$/, '멜론티켓'],
  [/ticketlink\.co\.kr$/, '티켓링크'],
  [/kream\.co\.kr$/, 'KREAM'],
  [/naver\.com$/, '네이버 예약'],
  [/comicw\.(net|co\.kr)$/, '코믹월드'],
  [/gstar\.or\.kr$/, '지스타'],
  [/playx4\.or\.kr$/, '플레이엑스포'],
  [/agfkorea\.com$/, 'AGF'],
  [/bicfest\.org$/, 'BIC'],
  [/biaf\.or\.kr$/, 'BIAF'],
  [/bicof\.com$/, 'BICOF'],
  [/illustar\.net$/, '일러스타 페스'],
]

export function ticketSiteName(ticketUrl) {
  if (!ticketUrl) return null
  let host
  try {
    host = new URL(ticketUrl).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  for (const [pattern, name] of KNOWN_SITES) {
    if (pattern.test(host)) return name
  }
  return host
}
