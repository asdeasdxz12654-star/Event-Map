// SerpAPI(구글·빙 이미지 검색)로 행사 공식 포스터를 찾는다.
// 환경변수: SERPAPI_KEY
//
// 네이버 이미지 검색(naver-image.mjs)만 쓰던 걸 이쪽으로 옮겼다. 이유는 두 가지다.
//   1) 결과에 "그 이미지가 실린 페이지 URL"이 같이 온다. 네이버는 이미지 URL만 줘서
//      cdn.job-post.co.kr 같은 언론사 CDN을 기사 사진으로 알아보기 어려웠는데,
//      페이지 URL(.../news/articleView.html)을 보면 바로 판정된다. 반대로 공식
//      포스터를 외부 CDN에 올려둔 공식 사이트도 페이지 URL 덕분에 공식으로 잡힌다.
//   2) 구글은 한 번에 100건을 주고, 빙은 결과 구성이 달라서 서로 못 찾는 걸 메운다.
//
// 채택 기준은 poster-filter.mjs에 그대로 있다 — 엔진만 바뀌었지 "공식 홍보물만" 원칙은
// 같다. 조건을 만족하는 게 없으면 null이고, 그러면 카테고리 기본 이미지가 나온다.
//
// 검색 횟수 주의: SerpAPI 무료 플랜은 월 250회다. 그래서 후보를 하나라도 건지면
// 거기서 멈추고, 개발 중 반복 실행은 SERPAPI_CACHE_DIR로 캐시해서 크레딧을 아낀다.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { judgeCandidate, isUsableImageUrl, isSharedPlatform } from './poster-filter.mjs'

const SERPAPI_URL = 'https://serpapi.com/search'

// 캐시 디렉터리를 지정하면 같은 (엔진, 검색어) 조합은 한 번만 실제로 호출한다.
// CI에서는 안 켜도 되고, 로컬에서 기준을 손보며 돌려볼 때 쓰라고 만든 스위치다.
const CACHE_DIR = process.env.SERPAPI_CACHE_DIR ?? ''

// 크레딧이 떨어지면 SerpAPI가 매 호출마다 같은 오류를 준다. 행사 수십 건을 도는
// 동안 그걸 계속 때리지 않도록, 한 번 확인하면 이후 호출을 아예 건너뛴다.
let quotaExhausted = false

export function isQuotaExhausted() { return quotaExhausted }

function cachePathFor(engine, query) {
  const key = createHash('sha1').update(`${engine}\n${query}`).digest('hex').slice(0, 16)
  return path.join(CACHE_DIR, `${engine}-${key}.json`)
}

async function readCache(engine, query) {
  if (!CACHE_DIR) return null
  try { return JSON.parse(await readFile(cachePathFor(engine, query), 'utf8')) }
  catch { return null }
}

async function writeCache(engine, query, data) {
  if (!CACHE_DIR) return
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(cachePathFor(engine, query), JSON.stringify(data), 'utf8')
  } catch { /* 캐시는 실패해도 그냥 넘어간다 */ }
}

// 빙은 크기를 "715×971" 문자열로 준다 (× 는 U+00D7).
function parseBingSize(size) {
  const m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(String(size ?? '').trim())
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 }
}

// 엔진별 응답을 poster-filter.mjs가 보는 공통 모양으로 바꾼다.
function normalize(engine, data) {
  const items = data?.images_results ?? []
  if (engine === 'bing_images') {
    return items.map(item => ({
      imageUrl: item.original,
      pageUrl: item.source ?? null, // 이미지가 실린 페이지 (item.link은 빙 상세 뷰어 주소다)
      // 빙 제목은 "명일방주: 엔드필드와 스타…"처럼 잘려 오는 경우가 많아서 설명을 붙인다.
      title: [item.title, item.description].filter(Boolean).join(' '),
      ...parseBingSize(item.size),
    }))
  }
  return items.map(item => ({
    imageUrl: item.original,
    pageUrl: item.link ?? null,
    title: item.title,
    width: item.original_width,
    height: item.original_height,
  }))
}

// site: 검색에 쓸 공식 사이트 도메인. 예매처·SNS는 남의 행사 자료가 훨씬 많아서
// 도메인 전체를 뒤져봐야 소용이 없으니 뺀다 (poster-filter의 공식 특례 기준과 같다).
// 크레딧을 아끼려고 최대 2개까지만 본다.
function officialDomains(officialUrls = []) {
  const domains = []
  for (const url of officialUrls) {
    if (!url || isSharedPlatform(url)) continue
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { continue }
    if (host && !domains.includes(host)) domains.push(host)
  }
  return domains.slice(0, 2)
}

async function searchImages(query, engine) {
  const cached = await readCache(engine, query)
  if (cached) return normalize(engine, cached)
  if (quotaExhausted) return []
  if (!process.env.SERPAPI_KEY) return []

  const url = new URL(SERPAPI_URL)
  url.searchParams.set('engine', engine)
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', process.env.SERPAPI_KEY)
  if (engine === 'bing_images') {
    url.searchParams.set('mkt', 'ko-kr')
  } else {
    url.searchParams.set('hl', 'ko')
    url.searchParams.set('gl', 'kr')
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const message = data?.error ?? `HTTP ${res.status}`
    // 무료 플랜 소진("Your account has run out of searches")·요금제 한도는 재시도해도 같다.
    if (/run out of searches|exceeded your searches|hourly searches/i.test(message)) {
      quotaExhausted = true
      console.warn(`  [이미지] SerpAPI 검색 한도 소진 — 이후 검색은 건너뜁니다 (${message})`)
    } else {
      console.warn(`  [이미지] SerpAPI(${engine}) 검색 실패: ${message}`)
    }
    return []
  }

  await writeCache(engine, query, data)
  return normalize(engine, data)
}

// 행사명과 관련 있고 "공식 홍보물로 볼 근거가 있는" 후보만 점수 높은 순으로 돌려준다.
// (URL 접속 확인은 안 함)
//   officialUrls: 행사 공식 사이트·예매처 URL. 이 도메인에서 온 이미지는 제목에
//                 '포스터' 같은 단어가 없어도 공식 자료로 인정한다.
//   eventYear: 행사 개최 연도. 제목에 연도가 없는 행사(예: "제29회 부천국제만화축제")도
//              옛 회차 포스터가 붙는 걸 막기 위해, URL에 다른 연도가 박혀 있으면
//              (/2016/04/25/ 같은 업로드 경로) 걸러낸다.
export async function findPosterCandidates(title, officialUrls = [], eventYear = null) {
  if (!title) return []
  if (!process.env.SERPAPI_KEY && !CACHE_DIR) return []

  // 공식 사이트를 아는 행사는 그 도메인 안에서만 찾는 게 압도적으로 정확하다.
  // "AGF 2025 포스터"로 그냥 검색하면 상위 결과가 기사 사진과 번개장터 굿즈 매물인데,
  // "site:agfkorea.com 포스터"는 첫 결과가 공식 포스터 파일(AGF_POSTER_2026.jpg)이다.
  // 그래서 site: 검색을 먼저 하고, 못 건지면 일반 검색으로 내려간다.
  // 하나라도 채택되면 그 자리에서 멈춘다 — 무료 플랜은 월 250회뿐이다.
  const attempts = [
    ...officialDomains(officialUrls).map(domain => ['google_images', `site:${domain} 포스터`]),
    ['google_images', `${title} 포스터`],
    ['bing_images', `${title} 포스터`],
    ['google_images', title],
  ]

  const seen = new Set()
  const candidates = []

  for (const [engine, query] of attempts) {
    let items = []
    try {
      items = await searchImages(query, engine)
    } catch (err) {
      console.warn(`  [이미지] SerpAPI(${engine}) 검색 실패: ${err.message}`)
      continue
    }

    for (const item of items) {
      if (!item.imageUrl || seen.has(item.imageUrl)) continue
      seen.add(item.imageUrl)
      const judged = judgeCandidate(item, title, officialUrls, eventYear)
      if (judged) candidates.push({ ...judged, engine })
    }

    if (candidates.length > 0) break
    if (quotaExhausted) break
  }

  return candidates.sort((a, b) => b.score - a.score)
}

// 관련 있는 후보 중 실제로 열리는 첫 번째 이미지를 반환한다.
// 조건을 만족하는 게 없으면 null (= 포스터 없음으로 두고 기본 이미지 사용).
export async function fetchEventPosterUrl(title, officialUrls = [], eventYear = null) {
  // 아직 한참 남은(내년 이후) 행사는 공식 포스터가 나오기 전이라, 검색해봐야 옛 회차
  // 포스터나 엉뚱한 이미지가 걸린다. 실제로 "지스타 2027"에 CAD 소프트웨어 패키지
  // 사진이 붙었다. 해가 바뀌어 그 행사가 올해가 되면 그때 다시 채우면 된다.
  if (eventYear && eventYear > new Date().getFullYear()) {
    console.log(`  -> 포스터: ${eventYear}년 행사라 아직 검색하지 않음`)
    return null
  }

  const candidates = await findPosterCandidates(title, officialUrls, eventYear)
  if (candidates.length === 0) {
    console.log('  -> 포스터: 관련 있는 이미지 없음, 건너뜀')
    return null
  }

  for (const candidate of candidates.slice(0, 5)) {
    if (!await isUsableImageUrl(candidate.link)) continue
    console.log(`  -> 포스터: ${candidate.title.slice(0, 50)} (일치도 ${candidate.score.toFixed(2)}, ${candidate.engine}) ${candidate.link.slice(0, 60)}...`)
    return candidate.link
  }

  console.log('  -> 포스터: 후보는 있었으나 열리는 이미지가 없음, 건너뜀')
  return null
}

// DB 없이 한 건만 확인해 보고 싶을 때:
//   node src/serpapi-image.mjs "AGF 2026" 2026 https://agfkorea.com
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [title, year, ...officialUrls] = process.argv.slice(2)
  if (!title) {
    console.error('사용법: node src/serpapi-image.mjs "<행사명>" [개최연도] [공식사이트 URL...]')
    process.exit(1)
  }
  const candidates = await findPosterCandidates(title, officialUrls, year ? Number(year) : null)
  console.log(`후보 ${candidates.length}건`)
  for (const c of candidates.slice(0, 10)) {
    const alive = await isUsableImageUrl(c.link) ? '열림' : '안 열림'
    console.log(`  [${c.score.toFixed(2)}][${c.engine}][${alive}]${c.official ? '[공식도메인]' : ''} ${c.title.slice(0, 60)}`)
    console.log(`    ${c.link}`)
    if (c.pageUrl) console.log(`    출처 ${c.pageUrl}`)
  }
}
