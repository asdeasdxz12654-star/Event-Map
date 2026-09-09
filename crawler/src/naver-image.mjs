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

export function isExcludedDomain(url) {
  try { return EXCLUDED_DOMAINS.some(d => new URL(url).hostname.includes(d)) }
  catch { return true }
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
  if (eventYears.length > 0 && candidateYears.length > 0) {
    if (!candidateYears.some(y => eventYears.includes(y))) return 0
  }

  const candidateText = candidate.join(' ')
  const matched = wanted.filter(t => candidateText.includes(t))

  // 가장 긴 토큰(대개 행사 고유명)은 반드시 있어야 한다.
  const core = [...wanted].sort((a, b) => b.length - a.length)[0]
  if (core && !candidateText.includes(core)) return 0

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

// 행사명과 실제로 관련 있는 후보만 점수 높은 순으로 돌려준다 (URL 접속 확인은 안 함).
export async function findPosterCandidates(title) {
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
      if (isExcludedDomain(link) || !hasUsableSize(item)) continue
      const score = relevanceScore(title, item.title ?? '')
      if (score < MIN_TOKEN_OVERLAP) continue
      candidates.push({ link, score, title: stripHtml(item.title ?? '') })
    }

    if (candidates.length > 0) break // 1차 쿼리에서 건졌으면 2차는 안 돈다
  }

  return candidates.sort((a, b) => b.score - a.score)
}

// 관련 있는 후보 중 실제로 열리는 첫 번째 이미지를 반환한다.
// 조건을 만족하는 게 없으면 null (= 포스터 없음으로 두고 기본 이미지 사용).
export async function fetchEventPosterUrl(title) {
  const candidates = await findPosterCandidates(title)
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
