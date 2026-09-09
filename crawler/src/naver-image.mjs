// 네이버 이미지 검색 API로 행사 포스터 URL을 찾는다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs, naver-local.mjs와 동일)
//
// 예전엔 "{제목} 포스터"로 검색해서 핀터레스트만 거른 뒤 "첫 번째 결과"를 그대로 썼다.
// 이미지 검색은 유사도 정렬이라 첫 결과가 전혀 다른 행사의 포스터·기사 사진인 경우가
// 흔했고, 그게 그대로 썸네일로 박혔다. 지금은 세 단계로 거른다:
//   1) 검색 결과 제목이 행사명과 실제로 겹치는지 (연도가 다르면 즉시 탈락)
//   2) 포스터로 쓸 만한 크기·비율인지
//   3) 그 URL이 실제로 열리고 이미지인지 (핫링크 차단으로 403인 경우가 많다)
// 하나라도 통과 못 하면 null을 반환한다 — 엉뚱한 이미지를 박느니 카테고리
// 기본 이미지가 나오는 편이 낫다.

const NAVER_IMAGE_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/image'

// 공식 포스터로 부적합한 도메인 — 핀터레스트 등 개인 큐레이션 이미지 제외
const EXCLUDED_DOMAINS = ['pinimg.com', 'pinterest.com', 'pinterest.co.kr']

const MIN_SIDE_PX = 200        // 너무 작은 썸네일 제외
const MAX_ASPECT_RATIO = 3     // 배너·파노라마 제외 (포스터는 세로형~정사각형)
const MIN_TOKEN_OVERLAP = 0.5  // 행사명 토큰이 절반 이상 겹쳐야 채택

// "공식 홍보물"로 볼 근거 — 이미지 제목에 아래 단어가 있거나, 행사 공식 사이트·예매처
// 도메인에서 온 이미지만 채택한다.
//
// 이 조건이 없을 때는 행사명이 들어간 언론사 기사 사진이 그대로 썸네일이 됐다.
// 실제로 코믹월드 회차 카드에 다른 행사에서 찍힌 코스어 인물 사진이 붙어 있었는데,
// 공식 홍보물이 아닐뿐더러 사진 속 개인의 초상권 문제도 있고 언론사 서버 핫링크라
// 저작권상으로도 쓸 수 없다. 포스터를 못 찾으면 카테고리 기본 이미지가 나온다.
const PROMO_KEYWORDS = ['포스터', '포스타', '키비주얼', '키 비주얼', '메인이미지', '메인 이미지', 'poster', 'keyvisual', 'key visual']

// 한국 도메인은 co.kr·or.kr처럼 2단계 TLD가 흔해서 뒤 두 조각만 보면 안 된다
// ("a.co.kr"과 "b.co.kr"이 같은 도메인으로 잡힌다).
const SECOND_LEVEL_KR = new Set(['co', 'or', 'ne', 'go', 're', 'pe', 'ac', 'hs', 'ms', 'es', 'sc', 'kg'])

function hostOf(url) {
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

// URL 경로에 들어 있는 연도(/2016/04/25/ 같은 업로드 날짜). 자릿수만 보고 아무 숫자나
// 연도로 읽지 않도록 슬래시로 구분된 조각만 본다.
export function yearsInUrl(url) {
  return [...String(url).matchAll(/\/(20[0-4]\d)\//g)].map(m => Number(m[1]))
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

// 행사명과 이미지 제목이 얼마나 겹치는지 0~1로 돌려준다. 연도가 서로 다르면 0
// (작년 포스터가 올라오는 게 가장 흔한 오류라 연도는 강하게 본다).
export function relevanceScore(eventTitle, candidateTitle) {
  const wanted = tokenize(eventTitle)
  if (wanted.length === 0) return 0
  const candidate = tokenize(candidateTitle)
  if (candidate.length === 0) return 0

  const eventYears = yearsIn(eventTitle)
  const candidateYears = yearsIn(candidateTitle)
  // 제목에 연도가 있는 행사는 후보에도 같은 연도가 있어야 한다.
  // 예전엔 "후보에 다른 연도가 있으면 탈락"이라 연도가 아예 없는 후보는 그냥 통과했고,
  // 그래서 "AGF 2027"에 주식 차트 이미지가 붙는 일이 생겼다. 연도를 요구하면 놓치는
  // 포스터도 생기지만, 엉뚱한 이미지를 붙이는 것보다는 기본 이미지가 낫다.
  if (eventYears.length > 0 && !candidateYears.some(y => eventYears.includes(y))) return 0

  // 토큰 비교: 짧은 이름은 "단어 자체"가 있어야 인정한다.
  // 부분 문자열까지 허용했더니 "지스타 2027"이 "지스타캐드 스탠다드 2027"(CAD 소프트웨어)에
  // 매칭됐다. 반대로 한국어는 "서울코믹월드"처럼 앞말을 붙여 쓰는 경우가 흔해서 무조건
  // 완전일치만 보면 정상 후보를 놓친다. 4글자 이상 토큰은 부분 일치를 허용해 절충한다.
  const candidateSet = new Set(candidate)
  const candidateText = candidate.join(' ')
  const hasToken = t => candidateSet.has(t) || (t.length >= 4 && candidateText.includes(t))
  const matched = wanted.filter(hasToken)

  // 행사 고유명(연도를 뺀 가장 긴 토큰)은 반드시 있어야 한다.
  // 연도를 제외하지 않으면 "AGF 2027"의 핵심 토큰이 "2027"이 돼서 이름은 안 맞아도
  // 연도만 같으면 통과해버린다.
  const nameTokens = wanted.filter(t => !/^20[2-4]\d$/.test(t))
  const core = [...nameTokens].sort((a, b) => b.length - a.length)[0]
  if (core && !hasToken(core)) return 0

  return matched.length / wanted.length
}

function hasUsableSize(item) {
  const w = Number(item.sizewidth)
  const h = Number(item.sizeheight)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return true // 정보 없으면 통과
  if (w < MIN_SIDE_PX || h < MIN_SIDE_PX) return false
  const ratio = Math.max(w / h, h / w)
  return ratio <= MAX_ASPECT_RATIO
}

// URL이 실제로 열리고 이미지인지 확인한다. 네이버 검색 결과에는 핫링크가 막혀
// 403이 나거나 이미 사라진 이미지가 섞여 있는데, 그대로 저장하면 카드가 깨진다.
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

async function searchImage(query) {
  const url = new URL(NAVER_IMAGE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '20')
  url.searchParams.set('filter', 'large')
  url.searchParams.set('sort', 'sim')

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.items ?? []
}

// 행사명과 관련 있고 "공식 홍보물로 볼 근거가 있는" 후보만 점수 높은 순으로 돌려준다.
// (URL 접속 확인은 안 함)
//   officialUrls: 행사 공식 사이트·예매처 URL. 이 도메인에서 온 이미지는 제목에
//                 '포스터' 같은 단어가 없어도 공식 자료로 인정한다.
//   eventYear: 행사 개최 연도. 제목에 연도가 없는 행사(예: "제29회 부천국제만화축제")도
//              옛 회차 포스터가 붙는 걸 막기 위해, 이미지 URL에 다른 연도가 박혀 있으면
//              (/2016/04/25/ 같은 업로드 경로) 걸러낸다.
export async function findPosterCandidates(title, officialUrls = [], eventYear = null) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) return []
  if (!title) return []

  const queries = [`${title} 포스터`, title]
  const seen = new Set()
  const candidates = []

  for (const query of queries) {
    let items = []
    try {
      items = await searchImage(query)
    } catch (err) {
      console.warn(`  [이미지] 검색 실패: ${err.message}`)
      continue
    }

    for (const item of items) {
      const link = item.link
      if (!link?.startsWith('http') || seen.has(link)) continue
      seen.add(link)
      if (isExcludedDomain(link) || isNewsPhotoUrl(link) || !hasUsableSize(item)) continue

      // URL 경로의 연도가 행사 연도와 다르면 옛 회차 자료다.
      if (eventYear) {
        const urlYears = yearsInUrl(link)
        if (urlYears.length > 0 && !urlYears.includes(eventYear)) continue
      }

      const itemTitle = stripHtml(item.title ?? '')
      const score = relevanceScore(title, item.title ?? '')
      if (score < MIN_TOKEN_OVERLAP) continue

      // 공식 홍보물 근거가 없으면(= 제목에 포스터/키비주얼 등이 없고 공식 도메인도
      // 아니면) 채택하지 않는다. 기사 사진·현장 사진이 여기서 걸러진다.
      const official = isOfficialHost(link, officialUrls)
      const lowerTitle = itemTitle.toLowerCase()
      const promo = PROMO_KEYWORDS.some(k => lowerTitle.includes(k))
      if (!official && !promo) continue

      // 공식 도메인 이미지를 먼저 쓰도록 가산점을 준다.
      candidates.push({ link, score: score + (official ? 1 : 0), title: itemTitle, official })
    }

    if (candidates.length > 0) break // 1차 쿼리에서 건졌으면 2차는 안 돈다
  }

  return candidates.sort((a, b) => b.score - a.score)
}

// 관련 있는 후보 중 실제로 열리는 첫 번째 이미지를 반환한다.
// 조건을 만족하는 게 없으면 null (= 포스터 없음으로 두고 기본 이미지 사용).
export async function fetchEventPosterUrl(title, officialUrls = [], eventYear = null) {
  const candidates = await findPosterCandidates(title, officialUrls, eventYear)
  if (candidates.length === 0) {
    if (title) console.log('  -> 포스터: 관련 있는 이미지 없음, 건너뜀')
    return null
  }

  for (const candidate of candidates.slice(0, 5)) {
    if (!await isUsableImageUrl(candidate.link)) continue
    console.log(`  -> 포스터: ${candidate.title} (일치도 ${candidate.score.toFixed(2)}) ${candidate.link.slice(0, 60)}...`)
    return candidate.link
  }

  console.log('  -> 포스터: 후보는 있었으나 열리는 이미지가 없음, 건너뜀')
  return null
}
