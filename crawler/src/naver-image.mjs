// 네이버 이미지 검색 API로 행사 포스터 URL을 찾는다.
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (naver.mjs, naver-local.mjs와 동일)

const NAVER_IMAGE_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/image'

// 공식 포스터로 부적합한 도메인 — 핀터레스트 등 개인 큐레이션 이미지 제외
const EXCLUDED_DOMAINS = ['pinimg.com', 'pinterest.com', 'pinterest.co.kr']

function isExcluded(url) {
  try { return EXCLUDED_DOMAINS.some(d => new URL(url).hostname.includes(d)) }
  catch { return true }
}

function stripHtml(str = '') {
  return str.replace(/<[^>]+>/g, '').trim()
}

async function searchImage(query) {
  const url = new URL(NAVER_IMAGE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '10')
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

// "{title} 포스터"로 검색 후 Pinterest 등을 제외한 첫 번째 유효 이미지를 반환한다.
// NAVER_CLIENT_ID/SECRET이 없으면 null 반환 (크롤러 부분 실행 지원).
export async function fetchEventPosterUrl(title) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) return null
  if (!title) return null

  let items = []
  try {
    // 1차: "{title} 포스터"로 검색
    items = await searchImage(`${title} 포스터`)
    // 2차: 결과가 없거나 전부 제외 도메인이면 제목만으로 재검색
    if (!items.some(i => !isExcluded(i.link))) {
      items = await searchImage(title)
    }
  } catch (err) {
    console.warn(`  [이미지] 검색 실패: ${err.message}`)
    return null
  }

  const item = items.find(i => i.link?.startsWith('http') && !isExcluded(i.link))
  if (!item) return null

  console.log(`  -> 포스터: ${stripHtml(item.title)} (${item.link.slice(0, 60)}...)`)
  return item.link
}
