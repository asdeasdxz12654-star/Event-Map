// 네이버 뉴스/카페글 검색 API로 "지스타"/"코믹월드"/"원신"처럼 자체 API가 없는 알려진 고정
// 행사나 게임사 공지를 능동적으로 검색해 RSS(수동적으로 흘러오는 기사만 잡음)가 놓치는 소식을
// 보완한다. 검색 결과는 RSS 아이템과 같은 모양({title, contentSnippet, link, pubDate})으로
// 정규화해서 crawl.mjs의 기존 looksRelevant/extractEvent 로직을 그대로 재사용한다 (자유
// 텍스트라 Groq 판단이 필요함 — KOPIS처럼 구조화 데이터가 아님).
//
// 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (NAVER API HUB에서 발급 — 예전 개발자센터
// openapi.naver.com과 도메인/경로/인증 헤더가 다르니 주의. 실제로 두 방식 다 curl로 확인함:
// 구버전(X-Naver-Client-Id 등, openapi.naver.com)은 401, API HUB 방식은 200 정상 응답.)

const NAVER_NEWS_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news'
const NAVER_CAFE_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/cafearticle'

// 호요버스 게임들은 이벤트/행사 공지가 뉴스보다 공식 네이버카페에 먼저 올라오는 경우가 많다.
// 카페글 검색은 "이 카페만" 지정해서 볼 수는 없고 키워드로 전체 카페를 검색하기 때문에,
// 응답에 같이 오는 cafeurl로 실제 확인한 공식 카페 글만 신뢰하고 나머지(팬카페 등)는 버린다.
// 명조/이환은 공식 채널이 네이버카페가 아니라 "네이버 라운지"인데, 라운지는 게임사가 자기
// 게임 클라이언트에 심는 SDK 기반 기능이라 외부에서 검색/조회하는 공개 API가 없다 (확인함).
// 젠레스 존 제로는 네이버 라운지(game.naver.com/lounge/ZZZ) 사용 확인 — 외부 API 없어서 접근 불가, 목록에서 뺌.
const CAFE_SEARCH_QUERIES = [
  { query: '원신 공지', officialCafeUrl: 'cafe.naver.com/genshin' },
  { query: '붕괴 스타레일 공지', officialCafeUrl: 'cafe.naver.com/honkaistarrail' },
  // 호요랜드는 각 게임 공식 카페에서 공지됨 — 두 카페에서 동시에 잡혀도 promote_event_draft()가 (title+start_date)로 dedup 처리
  { query: '호요랜드', officialCafeUrl: 'cafe.naver.com/genshin' },
  { query: '호요랜드', officialCafeUrl: 'cafe.naver.com/honkaistarrail' },
  // 블루아카이브 팝업/행사 — 구 카페(bluearchive)에서 bluearchive2로 이전됨
  { query: '블루아카이브 팝업', officialCafeUrl: 'cafe.naver.com/bluearchive2' },
  { query: '블루아카이브 행사', officialCafeUrl: 'cafe.naver.com/bluearchive2' },
]

// official-sites.mjs에 이미 등록된 정기 행사(지스타·코믹월드·AGF·일러스타페스·
// PlayX4·BIC)는 여기서 제거하고, 공식 사이트가 없거나 일정이 수시로 바뀌는
// 팝업·단발 행사만 능동적으로 찾는다.
// 효과: 23 → 8 쿼리, 최대 후보 230 → 80건으로 Groq TPD 부담 대폭 감소.
function q(text, activeMonths = null) {
  return { text, activeMonths }
}

export const NAVER_SEARCH_QUERIES = [
  // 코스프레 행사 — 공식 사이트 미등록
  q('코스앤코믹'),
  // 수시 팝업 / 게임사 오프라인 행사
  q('블루아카이브 팝업'),
  q('승리의여신니케 팝업'),
  q('호요랜드'),
  q('호요버스 팝업'),
  q('젠레스존제로 팝업'),
  q('명조 페스티벌'),
  q('띵조 페스티벌'),           // '명조'의 팬 애칭 표기
]

// 검색어가 많아서 20건씩 다 가져오면 후보가 너무 늘어 Groq 무료 티어 분당 한도에 계속 걸려
// 실행 시간이 길어진다. sort=date라 최신순이니 10건이면 충분히 최신 유지.
const DISPLAY_PER_QUERY = 10 // 검색어당 최신 N건

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

async function searchNaverCafe(query) {
  const url = new URL(NAVER_CAFE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('display', '20')
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

// 호요버스 게임 공식 카페 공지만 정규화해서 반환 (팬카페 등 공식이 아닌 글은 제외).
// 카페글 검색 응답에는 발행일(pubDate)이 없어서 published_at은 null로 둔다.
export async function fetchNaverCafeCandidates() {
  const results = []
  for (const { query, officialCafeUrl } of CAFE_SEARCH_QUERIES) {
    let items
    try {
      items = await searchNaverCafe(query)
    } catch (err) {
      console.error(`[네이버카페] "${query}" 검색 실패:`, err.message)
      continue
    }
    for (const item of items) {
      if (!item.cafeurl?.includes(officialCafeUrl)) continue // 공식 카페 글만 신뢰
      results.push({
        title: stripTags(item.title),
        contentSnippet: stripTags(item.description),
        link: item.link,
        pubDate: null,
      })
    }
  }
  return results
}

// crawl.mjs의 RSS 아이템과 동일한 모양으로 정규화해서 반환한다.
export async function fetchNaverCandidates() {
  const currentMonth = new Date().getMonth() + 1
  const results = []

  for (const { text: query, activeMonths } of NAVER_SEARCH_QUERIES) {
    if (activeMonths && !activeMonths.includes(currentMonth)) continue

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
