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
// PlayX4·BIC)는 여기서 제거하고, 공식 사이트가 없는 행사만 능동적으로 찾는다.
// 게임사 팝업/페스티벌 쿼리는 네이버카페(CAFE_SEARCH_QUERIES)가 더 정확히 잡아서 제거함.
function q(text, activeMonths = null) {
  return { text, activeMonths }
}

export const NAVER_SEARCH_QUERIES = [
  // 코스프레 행사 — 공식 사이트 미등록
  q('코스앤코믹'),
  // 코믹월드 — 일산(KINTEX)은 KINTEX API가 담당, 부산·청주·울산 등 비KINTEX 지역 보완
  q('코믹월드'),
  // 코코페 — 코리아코스프레페스티벌
  q('코코페'),
  // WONDERLIVET — 게임/애니 음악 라이브 행사
  q('WONDERLIVET'),
  // 부천 페스티벌 — 개최 시즌에만 검색
  q('부천국제애니메이션페스티벌', [9, 10, 11]),
  q('부천국제만화축제', [7, 8]),
  // 게임음악 콘서트 — KOPIS/KCISA가 놓치는 뉴스 기반 공연 보완
  q('게임 콘서트'),
  q('게임 OST 콘서트'),
  q('애니송 콘서트'),
  // 대형 게임쇼 참가업체/부스 정보 — 행사 직전 시즌에만 검색
  q('지스타 참가업체', [9, 10, 11]),
  q('AGF 참가', [10, 11, 12]),
  q('플레이엑스포 부스', [3, 4, 5]),
]

// 검색 결과 제목 기반 사전 필터. 게임 특화 쿼리를 써도 Naver API가 관련 기사를
// 함께 반환하는 경우가 있어, 게임·행사와 무관한 제목을 Groq 호출 전에 걷어낸다.
// ⚠️ 위 NAVER_SEARCH_QUERIES에 새 프랜차이즈/행사명을 추가할 땐 여기도 같이 추가할 것 —
// 안 하면 그 쿼리의 결과가 전부 조용히 필터링돼서 사라진다(아래 fetchNaverCandidates()의
// 쿼리별 0건 경고 로그로만 알아챌 수 있음).
const NAVER_GAME_TITLE_KEYWORDS = [
  '게임', '코스프레', '코스튬', '동인', '서브컬처',
  '코믹월드', '코스앤코믹', '일러스타', '지스타', 'AGF',
  '팝업스토어', '굿즈',
  '콘서트', 'OST', '애니송', '플레이엑스포',
  'WONDERLIVET', '코코페', '부천국제', 'BIAF', '만화축제',
]

function naverLooksRelevant(item) {
  const title = item.title ?? ''
  return NAVER_GAME_TITLE_KEYWORDS.some(k => title.includes(k))
}

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
// 제목 필터(naverLooksRelevant)를 여기서 바로 적용한다 — 필터 키워드가 같은 파일의
// NAVER_SEARCH_QUERIES 바로 아래 있어서, 쿼리를 추가하면서 필터를 깜빡할 위험을 줄인다.
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

    const relevant = items.filter(naverLooksRelevant)
    // 검색은 됐는데 전부 필터에 걸렸으면, 이 쿼리에 맞는 키워드가 NAVER_GAME_TITLE_KEYWORDS에
    // 없어서 새는 중일 수 있다 — 조용히 사라지지 않도록 경고를 남긴다.
    if (items.length > 0 && relevant.length === 0) {
      console.warn(`[네이버] "${query}" 검색 결과 ${items.length}건이 전부 제목 필터에 걸러짐 — NAVER_GAME_TITLE_KEYWORDS 확인 필요`)
    }

    for (const item of relevant) {
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
