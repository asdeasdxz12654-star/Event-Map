// 네이버 뉴스 검색 API로 "지스타"/"코믹월드"처럼 자체 API가 없는 알려진 고정 행사를
// 능동적으로 검색해 RSS(수동적으로 흘러오는 기사만 잡음)가 놓치는 소식을 보완한다.
// 검색 결과는 RSS 아이템과 같은 모양({title, contentSnippet, link, pubDate})으로 정규화해서
// crawl.mjs의 기존 looksRelevant/extractEvent 로직을 그대로 재사용한다 (자유 텍스트라 RSS와
// 동일하게 Claude 판단이 필요함 — KOPIS처럼 구조화 데이터가 아님).
//
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (NAVER API HUB에서 발급 — 예전 개발자센터
// openapi.naver.com과 도메인/경로/인증 헤더가 다르니 주의. 실제로 두 방식 다 curl로 확인함:
// 구버전(X-Naver-Client-Id 등, openapi.naver.com)은 401, API HUB 방식은 200 정상 응답.)

const NAVER_NEWS_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news'

// RSS로는 잘 안 잡히는, 자체 API 없는 고정/연례 행사 이름들. 필요하면 이 목록만 늘리면 된다.
export const NAVER_SEARCH_QUERIES = [
  '지스타 2026',
  '코믹월드',
  '서울코믹월드',
  'AGF 2026', // 애니메이션·게임 페스티벌
  '호요랜드', // 호요버스(원신/붕괴/명조 등) 오프라인 팝업 공간
  '호요버스 팝업',
  '명조 페스티벌',
  '띵조 페스티벌', // '명조'의 팬 애칭 표기, 뉴스에서도 종종 이 표기로 씀
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
      'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
      'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
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
