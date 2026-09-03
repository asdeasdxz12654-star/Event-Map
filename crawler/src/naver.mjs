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

// RSS로는 잘 안 잡히는, 자체 API 없는 고정/연례 행사 이름들. 필요하면 이 목록만 늘리면 된다.
// 검색어 단독으로는 정확도가 낮은 것도 있지만(예: 일반 명사와 겹침), 실제 이벤트가 있으면
// Claude/Groq 분류 단계에서 걸러지므로 재현율을 우선한다 — 단, 실제로 검색해봐도 관련 기사가
// 전혀 안 잡히는 것(예: '한일축제한마당'은 게임/코스프레와 무관한 한일 전통문화 교류 행사로
// 뜸)은 순수 노이즈라 아예 뺐다.
//
// activeMonths: 실제 웹 검색으로 "매년 몇 월에 열리는지" 확인된 행사만 그 시즌(발표가 미리
// 나오는 걸 감안해 앞뒤 여유 포함)에만 검색한다 — 연중 상시 검색보다 노이즈/실행시간을 줄임.
// 코믹월드처럼 연중 여러 번 열리는 것, 확인 안 된 것은 activeMonths 없이(=상시) 둔다.
function q(text, activeMonths = null) {
  return { text, activeMonths }
}

export const NAVER_SEARCH_QUERIES = [
  // 게임 전시/박람회
  q('지스타 2026', [8, 9, 10, 11]),          // 매년 11월 (2026: 11/19~22)
  q('PlayX4', [3, 4, 5]),                    // 매년 5월
  q('부산인디커넥트페스티벌', [6, 7, 8]),     // 매년 8월
  q('인디크래프트 게임'),                     // 개최월 미확인 -> 상시
  q('지스타 인디 쇼케이스', [8, 9, 10, 11]),  // 지스타 부대행사, 같은 시즌
  q('서울게임타운'),                          // 개최월 미확인 -> 상시
  // 애니/코스프레
  q('코믹월드'),                              // 연중 여러 번 개최 -> 상시
  q('서울코믹월드'),                          // 연중 여러 번 개최 -> 상시
  q('코스앤코믹'),                            // 연중 여러 번(회차제) 개최 -> 상시
  q('AGF 2026', [10, 11, 12]),               // 매년 12월 (2026: 12/4~6)
  q('일러스타페스'),                          // 연중 여러 번(2·5·8·10월대) 개최 -> 상시
  q('부천국제만화축제', [7, 8, 9]),           // 매년 9월
  // 게임사 주최 행사/음악회
  q('NDC 넥슨'),                              // 개최월 미확인 -> 상시
  q('네오위즈 버닝비버', [9, 10, 11, 12]),    // 매년 11~12월
  q('던전앤파이터 페스타'),                   // 고정월 없음 -> 상시
  q('메이플스토리 페스타'),                   // 고정월 없음 -> 상시
  q('블루아카이브 팝업'),                     // 수시 팝업 -> 상시
  q('승리의여신니케 팝업'),                   // 수시 팝업 -> 상시
  q('호요랜드'),                              // 수시 팝업 -> 상시
  q('호요버스 팝업'),                         // 수시 팝업 -> 상시
  q('젠레스존제로 팝업'),                     // 수시 팝업 -> 상시
  q('명조 페스티벌'),                         // 고정월 없음 -> 상시
  q('띵조 페스티벌'),                         // '명조'의 팬 애칭 표기
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
