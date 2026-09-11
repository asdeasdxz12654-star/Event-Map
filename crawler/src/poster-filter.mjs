// 이미지 검색 결과 중에서 "이 행사의 공식 포스터"만 남기는 판정 로직.
// 검색 엔진(SerpAPI·네이버)과 무관한 순수 판정만 모아둔다 — 엔진별 호출은
// serpapi-image.mjs / naver-image.mjs에 있고, 그 둘이 아래 형태로 정규화해서 넘긴다:
//   { imageUrl, pageUrl, title, width, height }
//     imageUrl: 실제 이미지 파일 URL (썸네일 아님)
//     pageUrl : 그 이미지가 실린 페이지 URL (모르면 null)
//
// 판정을 세게 잡는 이유는 지금까지 실제로 겪은 오판 때문이다 — 작년 회차 포스터,
// 언론사 기사 사진(초상권·핫링크), 관광공사 공용 사진, "지스타 2027"에 붙은
// GstarCAD 소프트웨어 패키지 사진. 의심스러우면 안 쓰는 편이 낫다
// (포스터가 없으면 카테고리 기본 이미지와 "공식 포스터 미정"이 나온다).

// 공식 포스터로 부적합한 도메인 — 핀터레스트 등 개인 큐레이션 이미지 제외
const EXCLUDED_DOMAINS = ['pinimg.com', 'pinterest.com', 'pinterest.co.kr']

const MIN_SIDE_PX = 200          // 너무 작은 썸네일 제외
const MAX_PORTRAIT_RATIO = 3     // 세로로 너무 긴 띠 제외 (A4 포스터가 1.41이다)
// 가로형은 1.4까지만 본다. 포스터는 세로형~정사각형이고, 가로로 넓은 건 배너 아니면
// 공유용 카드다 — 1200x630(1.90)짜리 오픈그래프 이미지가 대표적이다.
const MAX_LANDSCAPE_RATIO = 1.4
const MIN_TOKEN_OVERLAP = 0.5  // 행사명 토큰이 절반 이상 겹쳐야 채택

// "공식 홍보물"로 볼 근거 — 이미지·페이지 제목에 아래 단어가 있거나, 행사 공식 사이트·
// 예매처 도메인에서 온 이미지만 채택한다.
//
// 이 조건이 없을 때는 행사명이 들어간 언론사 기사 사진이 그대로 썸네일이 됐다.
// 실제로 코믹월드 회차 카드에 다른 행사에서 찍힌 코스어 인물 사진이 붙어 있었는데,
// 공식 홍보물이 아닐뿐더러 사진 속 개인의 초상권 문제도 있고 언론사 서버 핫링크라
// 저작권상으로도 쓸 수 없다.
const PROMO_KEYWORDS = ['포스터', '포스타', '키비주얼', '키 비주얼', '메인이미지', '메인 이미지', 'poster', 'keyvisual', 'key visual']

// 한국 도메인은 co.kr·or.kr처럼 2단계 TLD가 흔해서 뒤 두 조각만 보면 안 된다
// ("a.co.kr"과 "b.co.kr"이 같은 도메인으로 잡힌다).
const SECOND_LEVEL_KR = new Set(['co', 'or', 'ne', 'go', 're', 'pe', 'ac', 'hs', 'ms', 'es', 'sc', 'kg'])

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function registrableDomain(host) {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const last = parts.at(-1)
  const second = parts.at(-2)
  if (last === 'kr' && SECOND_LEVEL_KR.has(second)) return parts.slice(-3).join('.')
  return parts.slice(-2).join('.')
}

// 여러 행사가 같이 쓰는 플랫폼 — 예매처·SNS·블로그·커뮤니티.
// 행사의 website/ticket_url이 이런 곳이면 "그 도메인에서 왔다"는 사실만으로는
// 이 행사 자료라는 근거가 못 된다 (tickets.interpark.com에는 남의 행사 포스터가
// 수만 장 있다). 그래서 공식 도메인 특례에서 빼고, 제목이 실제로 맞는지 따진다.
const SHARED_PLATFORM_HOSTS = [
  'interpark.com', 'ticketlink.co.kr', 'melon.com', 'yes24.com', 'ticketbay.co.kr',
  'naver.com', 'kakao.com', 'daum.net', 'tistory.com', 'google.com', 'youtube.com',
  'instagram.com', 'twitter.com', 'x.com', 'facebook.com', 't.co', 'linktr.ee', 'litt.ly',
  'notion.site', 'onoffmix.com', 'festa.io', 'tumblbug.com', 'wadiz.kr',
  'arca.live', 'dcinside.com', 'fmkorea.com', 'ruliweb.com',
  'dongne.co',  // 동인 행사 신청·안내 플랫폼. 디. 페스타 등 여러 행사가 함께 올라온다
  // 전시장. 행사의 website가 전시장 행사 페이지인 경우가 있는데(venue-calendar.mjs),
  // 전시장에는 남의 행사 포스터가 훨씬 많아서 "이 도메인에서 왔으니 공식"으로 볼 수 없다.
  'bexco.co.kr', 'setec.or.kr', 'suwonmesse.com', 'kintex.com', 'ueco.or.kr',
  'coex.co.kr', 'kdjcenter.or.kr', 'exco.co.kr', 'songdoconvensia.com',
]

export function isSharedPlatform(url) {
  const host = hostOf(url)
  if (!host) return false
  const domain = registrableDomain(host)
  return SHARED_PLATFORM_HOSTS.some(h => domain === h || host === h || host.endsWith('.' + h))
}

// 행사 공식 사이트·예매처와 같은 도메인에서 온 이미지인지
export function isOfficialHost(link, officialUrls = []) {
  const host = hostOf(link)
  if (!host) return false
  const domain = registrableDomain(host)
  return officialUrls
    .map(hostOf)
    .filter(Boolean)
    .some(officialHost => domain === registrableDomain(officialHost))
}

export function isExcludedDomain(url) {
  try { return EXCLUDED_DOMAINS.some(d => new URL(url).hostname.includes(d)) }
  catch { return true }
}

// 언론사 기사 사진·범용 스톡 이미지인지. 공식 홍보물이 아니고, 대개 식별 가능한
// 개인이 찍혀 있으며(초상권), 언론사 서버 핫링크라 저작권상으로도 쓸 수 없다.
// 행사 공식 트위터/유튜브 이미지(pbs.twimg.com, yt3.googleusercontent.com 등)는
// 여기 걸리지 않게 해서, 공식 포스터를 그 경로로 올린 행사는 그대로 유지된다.
const NEWS_PHOTO_HOSTS = [
  'tong.visitkorea.or.kr', // 한국관광공사 대표 이미지 — 여러 행사가 돌려 쓰던 사진
  's3.tradingview.com',    // 주식 차트가 포스터로 잡힌 적 있음
]

export function isNewsPhotoUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (NEWS_PHOTO_HOSTS.some(h => host === h || host.endsWith('.' + h))) return true
    // 공공기관(.go.kr)은 주최·주관인 경우가 많고, 그 보도자료 페이지에 올라오는 이미지가
    // 곧 공식 포스터다. 실제로 부천국제만화축제 공식 포스터가 news.bucheon.go.kr에
    // 올라와 있는데, 아래 "news." 규칙에 걸려 언론사 사진으로 잘못 분류됐다.
    if (host.endsWith('.go.kr')) return false
    if (host.includes('imgnews')) return true          // imgnews.naver.net 등
    if (/(^|\.)news\./.test(host)) return true          // news.<언론사>.co.kr
    if (u.pathname.toLowerCase().includes('/news/')) return true // .../news/photo/...
    // 쇼핑몰 상품 이미지 — "지스타 2027"에 GstarCAD 소프트웨어 패키지 사진이 붙은 적 있다.
    if (/^shop\d*\.phinf\./.test(host)) return true
    if (host.includes('shopping')) return true
    return false
  } catch {
    return false
  }
}

// 중고거래·쇼핑몰 매물 사진인지. 구글 이미지에서 "AGF 2025 포스터"를 검색하면
// 상위 결과 절반이 번개장터·중고나라의 굿즈 매물 사진이다. 제목에 행사명도 "포스터"도
// 들어 있어서 기존 조건은 전부 통과하는데, 정작 사진은 남의 방바닥에 놓인 특전 굿즈다.
const RESALE_HOSTS = [
  'bunjang.co.kr', 'joongna.com', 'daangn.com', 'karrotmarket.com',
  'coupang.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr',
  'aliexpress.com', 'ebay.com', 'amazon.com', 'idus.com', 'danawa.com',
  'smartstore.naver.com', 'brand.naver.com',
]
export function isResaleUrl(url) {
  const host = hostOf(url)
  if (!host) return false
  const domain = registrableDomain(host)
  return RESALE_HOSTS.some(h => domain === h || host === h || host.endsWith('.' + h))
}

// 행사 정보를 모아 보여주는 사이트. 공식 자료가 아니라 남의 행사를 옮겨 싣거나,
// 아예 이미지를 자동 생성해서 쓴다. get-duck.com이 "일러스타 페스 14 | 이벤트 포스터"
// 라는 제목으로 내놓은 og/events/*.png는 글자 하나 없는 1200x630 그라데이션 배경이었다.
const AGGREGATOR_HOSTS = [
  'get-duck.com', 'linkareer.com', 'campuspick.com', 'wevity.com',
  'thinkcontest.com', 'all-con.co.kr', 'eventus.io',
  'showala.com',  // 전시 포털 — "부산일러스트레이션페어 V.7"의 공식 사이트로 잡혔었다
]

// 공유용 카드(오픈그래프) 이미지 경로. 포스터가 아니라 링크 미리보기용으로 만든 그림이다.
const SOCIAL_CARD_PATHS = ['/og/', '/og-image', '/og_image', '/opengraph', '/lookaside/crawler/', '/seo/google_widget/']

export function isAggregatorUrl(url) {
  const host = hostOf(url)
  if (!host) return false
  const domain = registrableDomain(host)
  if (AGGREGATOR_HOSTS.some(h => domain === h || host === h || host.endsWith('.' + h))) return true
  try {
    const path = new URL(url).pathname.toLowerCase()
    return SOCIAL_CARD_PATHS.some(p => path.includes(p))
  } catch {
    return false
  }
}

// 제목에 이게 있으면 이 행사의 공식 포스터가 아니다.
const REJECT_TITLE_KEYWORDS = [
  // 중고거래 매물 — 남의 방바닥에 놓인 특전 굿즈 사진이다
  '중고', '팝니다', '삽니다', '판매합니다', '양도', '대리구매', '미개봉', '택배비', '일괄판매',
  // 포스터 "공모전"은 행사 포스터가 아니라 별개 대회다. 실제로 "부산일러스트레이션페어 V.7"에
  // THE POSTER BUSAN 2026 공모전 포스터(접수기간 4/29~8/10)가 붙을 뻔했다 — 날짜부터 틀리다.
  '공모전', '공모 요강', '수상작',
]

function yearsInUrl(url) {
  // /2016/04/25/ 같은 업로드 경로뿐 아니라 2019.agfkorea.com 처럼 호스트에 박힌 연도도 잡는다
  // (공식 사이트가 지난 회차를 서브도메인으로 남겨두는 경우가 흔하다).
  // 앞뒤가 / 또는 . 인 것만 연도로 본다 — 20251015110657 같은 긴 숫자열은 제외.
  return [...String(url).matchAll(/(?:^|[/.])(20[0-4]\d)(?=[/.])/g)].map(m => Number(m[1]))
}

function stripHtml(str = '') {
  return str.replace(/<[^>]+>/g, '').trim()
}

// 비교용 토큰: 한글·영문·숫자만 남기고 2글자 이상만 쓴다.
// ("2026" 같은 4자리 연도는 따로 뽑아 연도 불일치 판정에 쓴다)
function tokenize(text) {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .split(' ')
    .filter(t => t.length >= 2)
}

function yearsIn(text) {
  return (stripHtml(text).match(/\b(20[2-4]\d)\b/g) ?? []).map(Number)
}

// "제29회"·"35회"처럼 회차를 가리키는 토큰은 행사 "이름"이 아니다.
// 공식 포스터 제목은 회차 대신 연도를 쓰는 일이 흔해서(제29회 부천국제만화축제의
// 공식 포스터 제목은 "2026 부천국제만화축제"다) 이걸 이름에 섞으면 일치도가 늘 반 토막
// 나고, 심하면 고유명 자리까지 차지한다 — "제35회 디. 페스타"의 가장 긴 토큰이
// "제35회"라서 이름 비교가 통째로 0이 됐다. 회차가 맞는지는 hasNumberConflict가 본다.
const isEditionToken = t => /^제?\d+회$/.test(t)

// 행사명에서 이름에 해당하는 토큰만 (연도·회차 표기 제외)
function nameTokensOf(eventTitle) {
  return tokenize(eventTitle).filter(t => !/^20[2-4]\d$/.test(t) && !isEditionToken(t))
}

// 행사명에서 그 행사를 가리키는 고유명 하나 — 연도·회차를 뺀 가장 긴 토큰.
// "2026 대전콘텐츠페어" -> "대전콘텐츠페어", "AGF 2027" -> "agf".
// 연도를 빼지 않으면 "AGF 2027"의 핵심 토큰이 "2027"이 돼서, 이름은 안 맞고 연도만
// 같은 이미지가 통과해버린다.
export function coreNameToken(eventTitle) {
  return [...nameTokensOf(eventTitle)].sort((a, b) => b.length - a.length)[0] ?? ''
}

// 행사명(연도·회차 제외)이 어떤 글에 얼마나 들어 있는지 0~1로 돌려준다.
// 고유명이 없으면 0 — 이름이 안 맞으면 나머지가 겹쳐도 다른 행사다.
export function nameOverlapScore(eventTitle, text) {
  const wanted = nameTokensOf(eventTitle)
  if (wanted.length === 0) return 0
  const candidate = tokenize(text)
  if (candidate.length === 0) return 0

  // 토큰 비교: 짧은 이름은 "단어 자체"가 있어야 인정한다.
  // 부분 문자열까지 허용했더니 "지스타 2027"이 "지스타캐드 스탠다드 2027"(CAD 소프트웨어)에
  // 매칭됐다. 반대로 한국어는 "서울코믹월드"처럼 앞말을 붙여 쓰는 경우가 흔해서 무조건
  // 완전일치만 보면 정상 후보를 놓친다. 4글자 이상 토큰은 부분 일치를 허용해 절충한다.
  const candidateSet = new Set(candidate)
  const candidateText = candidate.join(' ')
  const hasToken = t => candidateSet.has(t) || (t.length >= 4 && candidateText.includes(t))

  const core = coreNameToken(eventTitle)
  if (core && !hasToken(core)) return 0

  return wanted.filter(hasToken).length / wanted.length
}

// 행사명과 이미지 제목이 얼마나 겹치는지 0~1로 돌려준다. 연도가 서로 다르면 0
// (작년 포스터가 올라오는 게 가장 흔한 오류라 연도는 강하게 본다).
function relevanceScore(eventTitle, candidateTitle) {
  const eventYears = yearsIn(eventTitle)
  const candidateYears = yearsIn(candidateTitle)
  // 제목에 연도가 있는 행사는 후보에도 같은 연도가 있어야 한다.
  // 예전엔 "후보에 다른 연도가 있으면 탈락"이라 연도가 아예 없는 후보는 그냥 통과했고,
  // 그래서 "AGF 2027"에 주식 차트 이미지가 붙는 일이 생겼다. 연도를 요구하면 놓치는
  // 포스터도 생기지만, 엉뚱한 이미지를 붙이는 것보다는 기본 이미지가 낫다.
  if (eventYears.length > 0 && !candidateYears.some(y => eventYears.includes(y))) return 0

  return nameOverlapScore(eventTitle, candidateTitle)
}

// 행사명에 든 회차 숫자가 서로 어긋나는지.
// "코믹월드 336 일산"으로 검색하면 공식 사이트(comicw.net)에서 "[코믹월드 330 일산] 포스터
// 1차 발송 완료" 게시물이 딸려 나오는데, 토큰은 2/3이 겹쳐서 예전 기준으로는 통과했다.
// 회차가 다르면 다른 행사고, 포스터도 당연히 다르다.
// 한쪽에 회차가 아예 없으면(예: "일러스타 페스" 사이트 제목) 판단 근거가 없으니 통과시킨다.
//
// 연도(20xx)는 회차로 세지 않는다. 예전엔 연도까지 같이 봐서, "제29회 부천국제만화축제"의
// 숫자는 [29]인데 공식 포스터 제목은 "2026 부천국제만화축제"라 [2026] — 겹치는 숫자가
// 하나도 없으니 항상 "회차 불일치"로 탈락했다. 올해 열리는 제N회 행사들이 통째로 포스터를
// 못 찾던 이유가 이것이다. 연도가 맞는지는 judgeCandidate의 연도 검사와 relevanceScore가
// 이미 따로 보고 있어서 여기서 또 볼 필요가 없다.
function editionNumbers(text) {
  return [...String(text).matchAll(/\d{2,}/g)]
    .map(m => m[0])
    .filter(n => !/^20[0-4]\d$/.test(n))
}

function hasNumberConflict(eventTitle, candidateTitle) {
  const wanted = editionNumbers(eventTitle)
  if (wanted.length === 0) return false
  const found = editionNumbers(candidateTitle)
  if (found.length === 0) return false
  return !found.some(n => wanted.includes(n))
}

// 행사명의 숫자(연도 2026, 회차 336)가 후보 쪽 어딘가에 그대로 있는지.
// 긴 숫자열(업로드 타임스탬프 1779456993434) 안에 우연히 들어 있는 건 인정하지 않는다.
function hasIdentityNumber(eventTitle, haystack) {
  const wanted = [...String(eventTitle).matchAll(/\d{2,}/g)].map(m => m[0])
  if (wanted.length === 0) return true // 숫자가 없는 행사명이면 이 검사로 걸 게 없다
  return wanted.some(n => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(haystack))
}

// 같은 이름으로 지역을 옮겨 가며 여는 행사가 많다 — 코믹월드(일산·울산·수원·부산),
// 일러스트코리아(코엑스·인천·수원). 공식 사이트 한 곳이 그 회차를 전부 담고 있어서
// "2026 인천 일러스트코리아"에 코엑스 회차 키비주얼이 붙었다. 행사명에 지역이 박혀 있는데
// 후보가 다른 지역을 말하고 있으면 다른 회차다.
const REGION_WORDS = [
  '서울', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '제주',
  '일산', '고양', '수원', '성남', '판교', '부천', '안양', '청주', '전주', '창원', '천안', '경주',
  '코엑스', '킨텍스', '벡스코', '세텍', 'setec', '송도', 'coex', 'kintex', 'bexco',
]

function hasRegionConflict(eventTitle, candidateText) {
  const lowerEvent = eventTitle.toLowerCase()
  const wanted = REGION_WORDS.filter(r => lowerEvent.includes(r))
  if (wanted.length === 0) return false
  const lowerCandidate = String(candidateText).toLowerCase()
  if (wanted.some(r => lowerCandidate.includes(r))) return false // 같은 지역을 말하고 있으면 통과
  return REGION_WORDS.some(r => lowerCandidate.includes(r))      // 다른 지역만 말하고 있으면 탈락
}

// 파일명에 글자와 붙어 있는 연도 (history2024Poster.jpg). yearsInUrl은 /2024/ 처럼
// 구분자로 떨어진 것만 보기 때문에 이건 못 잡는데, 공식 사이트가 지난 회차 포스터를
// 같은 폴더에 두는 경우가 많아서 파일명만 따로 한 번 더 본다.
function yearsInFilename(url) {
  let decoded = String(url)
  try { decoded = decodeURIComponent(decoded) } catch { /* 원문 그대로 본다 */ }
  const filename = decoded.split(/[?#]/)[0].split('/').pop() ?? ''
  return [...filename.matchAll(/(?<!\d)(20[0-4]\d)(?!\d)/g)].map(m => Number(m[1]))
}

function hasUsableSize({ width, height }) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return true // 정보 없으면 통과
  if (w < MIN_SIDE_PX || h < MIN_SIDE_PX) return false
  return w > h ? w / h <= MAX_LANDSCAPE_RATIO : h / w <= MAX_PORTRAIT_RATIO
}

// URL이 실제로 열리고 이미지인지 확인한다. 검색 결과에는 핫링크가 막혀 403이 나거나
// 이미 사라진 이미지가 섞여 있는데, 그대로 저장하면 카드가 깨진다.
export async function isUsableImageUrl(url) {
  if (!url || !url.startsWith('http') || isExcludedDomain(url)) return false
  try {
    // Range로 첫 바이트만 요청 — 큰 이미지를 통째로 받지 않기 위해서.
    // HEAD를 막아둔 서버가 많아서 GET을 쓴다.
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 (compatible; game-event-hub/1.0)' },
      signal: AbortSignal.timeout(7_000),
    })
    if (!res.ok && res.status !== 206) return false
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return false
    // 본문을 안 읽고 끊어서 소켓이 남지 않게 한다.
    await res.body?.cancel()
    return true
  } catch {
    return false
  }
}

// 정규화된 검색 결과 하나가 "이 행사의 공식 포스터"로 쓸 만한지 판정한다.
// 쓸 수 있으면 { link, pageUrl, score, title, official }, 아니면 null.
//
// 검색 엔진이 페이지 URL을 같이 주면 이미지 URL만 볼 때보다 판정이 정확해진다.
// 기사 사진은 이미지가 별도 CDN(cdn.job-post.co.kr)에 있어서 이미지 URL만으로는
// 언론사인지 알기 어려운데, 실린 페이지(.../news/articleView.html)를 보면 바로 드러난다.
// 반대로 공식 포스터를 외부 CDN에 올린 공식 사이트도 페이지 URL 덕에 공식으로 잡힌다.
export function judgeCandidate(item, eventTitle, officialUrls = [], eventYear = null) {
  const link = item.imageUrl
  if (!link?.startsWith('http')) return null
  const pageUrl = item.pageUrl ?? null

  if (isExcludedDomain(link)) return null
  if (pageUrl && isExcludedDomain(pageUrl)) return null
  if (isNewsPhotoUrl(link) || (pageUrl && isNewsPhotoUrl(pageUrl))) return null
  if (isResaleUrl(link) || (pageUrl && isResaleUrl(pageUrl))) return null
  if (isAggregatorUrl(link) || (pageUrl && isAggregatorUrl(pageUrl))) return null
  if (!hasUsableSize(item)) return null

  const itemTitle = stripHtml(item.title ?? '')
  const lowerTitle = itemTitle.toLowerCase()
  if (REJECT_TITLE_KEYWORDS.some(k => itemTitle.includes(k))) return null

  // 공식 사이트·예매처 도메인에서 온 이미지인지. 이미지가 CDN에 있어도 실린 페이지가
  // 공식 사이트면 공식으로 본다 (반대로 기사 CDN은 위 isNewsPhotoUrl에서 걸린다).
  // 단, 예매처·SNS처럼 여러 행사가 함께 쓰는 플랫폼은 특례 대상이 아니다.
  const official =
    (isOfficialHost(link, officialUrls) && !isSharedPlatform(link)) ||
    (pageUrl ? isOfficialHost(pageUrl, officialUrls) && !isSharedPlatform(pageUrl) : false)

  // 연도가 어긋나면 옛 회차 자료다. 공식 사이트는 지난 회차를 그대로 남겨두는
  // 경우가 많아서(2019.agfkorea.com, history2024Poster.jpg) 공식 도메인이어도 똑같이 본다.
  if (eventYear) {
    const urlYears = [
      ...yearsInUrl(link), ...yearsInFilename(link),
      ...(pageUrl ? yearsInUrl(pageUrl) : []),
    ]
    if (urlYears.length > 0 && !urlYears.includes(eventYear)) return null
    // 여기선 2019처럼 지난 연도까지 걸러야 해서 relevanceScore보다 범위를 넓게 본다.
    const titleYears = (itemTitle.match(/\b(20[0-4]\d)\b/g) ?? []).map(Number)
    if (titleYears.length > 0 && !titleYears.includes(eventYear)) return null
  }

  // 회차가 어긋나도 다른 행사다 (코믹월드 336 ↔ 330).
  if (hasNumberConflict(eventTitle, itemTitle)) return null

  // 지역이 어긋나도 다른 회차다 (인천 일러스트코리아 ↔ 코엑스 일러스트코리아).
  // 제목뿐 아니라 페이지 주소도 본다 — 회차를 /coex/, /incheon/으로 나눠 둔 사이트가 많다.
  let decodedPage = pageUrl ?? ''
  try { decodedPage = decodeURIComponent(decodedPage) } catch { /* 원문 그대로 */ }
  if (hasRegionConflict(eventTitle, `${itemTitle} ${decodedPage}`)) return null

  // 이미지가 포스터라는 표시 — 제목이든 파일 이름이든. 공식 사이트는 페이지 제목이
  // 그대로 이미지 제목이 되는 경우가 많아서(AGF의 "행사정보 - Anime x Game Festival
  // 2026") 파일 이름(AGF_POSTER_2026.jpg)까지 봐야 포스터를 골라낼 수 있다.
  let decodedLink = link
  try { decodedLink = decodeURIComponent(link) } catch { /* 이상한 인코딩이면 원문 그대로 */ }
  const posterInUrl = PROMO_KEYWORDS.some(k => decodedLink.toLowerCase().includes(k))
  const posterInTitle = PROMO_KEYWORDS.some(k => lowerTitle.includes(k))

  const score = relevanceScore(eventTitle, itemTitle)

  if (official) {
    // 공식 도메인이라고 아무 이미지나 쓸 수는 없다. 지스타 공식 사이트에서 제일 먼저
    // 걸린 건 연사 사진(SPEAKER_202608131002163770.jpg)이었고, 인디커넥트는 업로드
    // 번호만 붙은 사진(1693816550.jpg)이었다. 포스터라는 표시가 있어야 채택한다.
    // 대신 제목 일치는 요구하지 않는다 — 공식 사이트 페이지 제목은 행사명과 다르게
    // 적혀 있기 일쑤라(AGF), 그걸 요구하면 정작 진짜 포스터를 놓친다.
    if (!posterInUrl && !posterInTitle) return null
    // 그리고 한 도메인이 여러 행사를 다루기도 한다. comicw.net(코믹월드 공식)의
    // 행사일정 페이지에는 남의 행사 포스터(MeetTheItasha-Poster.webp)가 올라와 있어서,
    // "코믹월드 336 일산"에도 "문구전 2026 가을"에도 똑같이 딸려 나왔다.
    // 그래서 "이 행사를 가리키는 근거"를 하나는 요구한다 — 행사명의 숫자(연도·회차)가
    // 제목이든 URL이든 박혀 있거나, 아니면 제목이 행사명과 충분히 겹치거나.
    //
    // 숫자만 보던 걸 이름 쪽으로 넓힌 이유: "제29회 부천국제만화축제"처럼 회차만 있고
    // 연도가 없는 행사는 공식 포스터 파일에 29가 안 들어간다(2026만 들어간다). 그래서
    // 공식 사이트에서 제 포스터를 찾아놓고도 전부 탈락했다. 이름이 맞으면 그것도 근거다
    // — 위 문구전 사례는 이름 점수가 0이라 이 완화로도 여전히 걸러진다.
    const identified =
      hasIdentityNumber(eventTitle, `${itemTitle} ${decodedLink} ${pageUrl ?? ''}`) ||
      score >= MIN_TOKEN_OVERLAP
    if (!identified) return null
    return { link, pageUrl, score: 1 + score + posterBonus(posterInUrl, item), title: itemTitle, official }
  }

  if (score < MIN_TOKEN_OVERLAP) return null

  // 공식 홍보물 근거가 없으면(= 제목에 포스터/키비주얼 등이 없고 공식 도메인도
  // 아니면) 채택하지 않는다. 기사 사진·현장 사진이 여기서 걸러진다.
  if (!posterInTitle) return null

  return { link, pageUrl, score, title: itemTitle, official }
}

// 같은 공식 사이트 안에서도 로고·배경(AGF_LOGO_2026.png, 3840x3840)보다 포스터
// (AGF_POSTER_2026.jpg, 1191x1684)를 먼저 쓰도록 가산점을 준다.
function posterBonus(posterInUrl, { width, height }) {
  let bonus = posterInUrl ? 0.5 : 0 // 파일 이름에 poster가 박힌 쪽이 확실하다
  const w = Number(width)
  const h = Number(height)
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > w * 1.15) bonus += 0.25 // 포스터는 세로형
  return bonus
}
