// 네이버 뉴스 검색 API로 "지스타"/"코믹월드"처럼 자체 API가 없는 알려진 고정 행사를
// 능동적으로 검색해 RSS(수동적으로 흘러오는 기사만 잡음)가 놓치는 소식을 보완한다.
// 검색 결과는 RSS 아이템과 같은 모양({title, contentSnippet, link, pubDate})으로 정규화해서
// crawl.mjs의 기존 looksRelevant/extractEvent 로직을 그대로 재사용한다 (자유 텍스트라 RSS와
// 동일하게 Claude 판단이 필요함 — KOPIS처럼 구조화 데이터가 아님).
//
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (developers.naver.com에서 무료 발급, 검색 API
// 기준 하루 25,000건 한도)

const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json'

// RSS로는 잘 안 잡히는, 자체 API 없는 고정/연례 행사 이름들. 필요하면 이 목록만 늘리면 된다.
export const NAVER_SEARCH_QUERIES = [
  '지스타 2026',
  '코믹월드',
  '서울코믹월드',
]

const DISPLAY_PER_QUERY = 20 // 검색어당 최신 N건

function stripTags(html = '') {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

async function searchNaverNews(query) {
  const url = new URL(NAVER_NEWS_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(DISPLAY_PER_QUERY))
  url.searchParams.set('sort', 'date') // 최신순

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  return data.items ?? []
}

// crawl.mjs의 RSS 아이템과 동일한 모양으로 정규화해서 반환한다.
export async function fetchNaverCandidates() {
  const results = []
  for (const query of NAVER_SEARCH_QUERIES) {
    let items
    try {
      items = await searchNaverNews(query)
    } catch (err) {
      console.error(`[네이버] "${query}" 검색 실패:`, err.message)
      continue
    }
    for (const item of items) {
      results.push({
        title: stripTags(item.title),
        contentSnippet: stripTags(item.description),
        link: item.originallink || item.link,
        pubDate: item.pubDate,
      })
    }
  }
  return results
}
