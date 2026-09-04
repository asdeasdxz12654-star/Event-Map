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
//
// 원신/붕괴 스타레일 두 카페는 공지 담당 매니저 계정으로 실제 공식 카페임을 확인함:
// 원신: https://cafe.naver.com/f-e/cafes/29893655/members/moLCYG3NoF2zo4i4wq7c1RsnSkqIzMomnIlUgK9GOVY
// 붕괴 스타레일: https://cafe.naver.com/f-e/cafes/30487825/members/H11u1fdSGPn2eqLR8avQzUx0zA_O4GmzgLGIGacRqsY
const GENSHIN_CAFE = 'cafe.naver.com/genshin'
const HONKAI_CAFE = 'cafe.naver.com/honkaistarrail'

// 언제 열릴지 예측할 수 없는 수시 오프라인 행사 — 매일 검색한다.
const COMMON_CAFE_KEYWORDS = [
  '전시회', '팝업스토어', '콜라보', '콘서트', '굿즈', '오프라인', '퍼레이드',
]

function cafeQuery(query, officialCafeUrl, activeWindow = null) {
  return { query, officialCafeUrl, activeWindow }
}

// 매년 시기가 정해진 행사라, 정보가 실제로 올라오는 기간에만 검색해서 평소엔 무의미한
// 후보(Groq 호출)를 줄인다. activeWindow는 fetchNaverCafeCandidates()의 isActiveNow()가 검사.
// - 호요랜드: 매년 10월경 개최, 8/20~9/30 사이에 굿즈·무대 시간표 등 상세 정보가 먼저 공개됨
//   (두 게임 공용 행사라 원신·붕괴 스타레일 카페 모두에서 검색).
// - 원신 "주년 기념": 원신 주년 행사가 9월에 시작돼서 9월만 검색.
// - 붕괴 스타레일 "주년 축제": 붕괴 스타레일 주년 행사가 4월에 시작돼서 4월만 검색.
const HOYOLAND_WINDOW = { fromMonthDay: '08-20', toMonthDay: '09-30' }

const SEASONAL_CAFE_QUERIES = [
  cafeQuery('호요랜드', GENSHIN_CAFE, HOYOLAND_WINDOW),
  cafeQuery('호요랜드', HONKAI_CAFE, HOYOLAND_WINDOW),
  cafeQuery('주년 기념', GENSHIN_CAFE, { months: [9] }),
  cafeQuery('주년 축제', HONKAI_CAFE, { months: [4] }),
]

const CAFE_SEARCH_QUERIES = [
  ...[GENSHIN_CAFE, HONKAI_CAFE].flatMap(officialCafeUrl =>
    COMMON_CAFE_KEYWORDS.map(query => cafeQuery(query, officialCafeUrl))
  ),
  ...SEASONAL_CAFE_QUERIES,
]

function isActiveNow(activeWindow) {
  if (!activeWindow) return true // 기간 제한 없음 — 상시 검색
  const now = new Date()
  if (activeWindow.months) return activeWindow.months.includes(now.getMonth() + 1)
  if (activeWindow.fromMonthDay && activeWindow.toMonthDay) {
    const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return monthDay >= activeWindow.fromMonthDay && monthDay <= activeWindow.toMonthDay
  }
  return true
}

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
  for (const { query, officialCafeUrl, activeWindow } of CAFE_SEARCH_QUERIES) {
    if (!isActiveNow(activeWindow)) continue

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
