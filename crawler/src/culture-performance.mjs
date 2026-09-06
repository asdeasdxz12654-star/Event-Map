// 문화체육관광부(한국문화정보원 KCISA) "문화예술공연(통합)" 오픈API(CNV_060)에서 게임/코스프레/
// 게임음악 관련 공연·행사를 찾아 crawl.mjs와 동일한 형태의 "후보"로 변환한다. 국립아시아문화전당·
// 국립극장·국립정동극장 등 여러 문화기관의 공연정보를 표준화해 하나의 API로 제공하는 KCISA
// 융합콘텐츠 오픈API다. KOPIS/KINTEX/KMRB와 마찬가지로 이미 구조화된 공식 데이터라 Groq를
// 호출하지 않고 필드를 그대로 매핑하며, "진짜 게임 관련인지"는 키워드 매칭 기반이라 confidence로
// 신뢰도를 표시해 관리자 검수에서 최종 판단하도록 한다.
//
// 환경변수: CULTURE_PERFORMANCE_API_KEY (data.go.kr에서 발급받은 서비스키, UUID 형식)
//
// 엔드포인트/필드는 실 서비스키로 직접 호출해 확인함 (2026-09-06):
//   https://api.kcisa.kr/openapi/CNV_060/request?serviceKey=...&numOfRows=100&pageNo=1
//   keyword 파라미터를 붙여도 결과가 동일함 — 서버 사이드 검색/필터링 미지원(확인함), 그래서
//   전체 목록을 받아 클라이언트에서 키워드로 걸러야 한다.
// 응답 필드(item): title(공연명), eventPeriod("YYYYMMDD ~ YYYYMMDD"), eventSite(장소),
//   charge(요금), contactPoint(문의처), url(상세 페이지, mcst.go.kr), description(HTML 소개),
//   imageObject(이미지 URL). venue_address·주최기관명에 해당하는 필드는 없음.
// totalCount가 6만 건을 넘는다(전국 문화행사 누적 아카이브로 보임) — 목록 순서를 여러 페이지
// 걸쳐 실측한 결과 등록 최신순으로 보인다(1페이지는 전부 9월 상순 행사, 640페이지는 전부
// 7~8월에 이미 끝난 행사). 다만 공식 문서에 명시된 정렬 기준은 아니라 100% 보장은 아니므로,
// 페이지당 필터링 후 "이미 끝난 공연만 있는 페이지"를 만나면 그 이후는 더 오래된 데이터로
// 보고 조기 종료한다(MAX_PAGES는 그래도 못 멈출 경우의 최종 안전장치).
import { XMLParser } from 'fast-xml-parser'
import { EventExtractionSchema } from './schema.mjs'
import { asArray, formatDateCompact } from './xml-utils.mjs'

// xml-utils.mjs의 공유 xmlParser(엔티티 확장 기본 한도 1000)를 안 쓰고 별도 인스턴스를 둔다 —
// 이 API는 응답 하나에 항목이 100개씩 들어있고 각 항목의 description에 &amp;/&nbsp;/&lt;br/&gt;
// 같은 HTML 엔티티가 반복돼서, 100건만 받아도 실측 1,132회로 fast-xml-parser 기본 한도(1,000)를
// 넘는다(정상 응답인데 막힘, 확인함). 공식 API가 보내는 신뢰할 수 있는 응답이라 한도를 넉넉히 올린다.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: { enabled: true, maxTotalExpansions: 20_000, maxExpandedLength: 2_000_000 },
})

const CULTURE_API_URL = 'https://api.kcisa.kr/openapi/CNV_060/request'
const ROWS_PER_PAGE = 100
const MAX_PAGES = 30 // 최종 안전장치 — 조기 종료 로직이 보통 이보다 먼저 멈춘다

// KOPIS/KINTEX와 같은 방식 — 게임 프랜차이즈명은 단독으로도 신뢰도 높은 신호(confidence: high).
// 주의: 이 API는 전국 문화기관 공연·전시 6만여 건을 아우르는 일반 데이터셋이라, 게임 프랜차이즈
// 이름 중 흔한 한국어 단어와 겹치는 것은 반드시 빼야 한다 — 실제로 '붕괴'(붕괴:스타레일에서 따옴)가
// "성수대교 붕괴"·"학교 붕괴" 등 무관한 기사에 계속 걸렸고, '니케'(니케:여신의 승리)도 승리의
// 여신 조각상 등 미술 작품 설명에 걸려서 뺐다(실 데이터로 확인함). 같은 이유로 '명조'(서체 이름과
// 겹침)·'이환'(建강 관련 한자어와 겹침)도 제외 — kintex.mjs는 킨텍스 전시 행사만 다뤄 이런
// 단어들도 안전했지만, 여긴 데이터 모집단이 완전히 다르다.
const FRANCHISE_KEYWORDS = [
  '지스타', '코믹월드', 'AGF', '일러스타페스', '원신', '스타레일', '젠레스',
  '블루아카이브', '메이플스토리', '던전앤파이터', '로스트아크', '리니지', '배틀그라운드',
  '검은사막', '쿠키런', '오버워치', '리그오브레전드', '파이널판타지', '젤다', '포켓몬',
  'WONDERLIVET', '코코페',
  '부천국제애니메이션페스티벌', 'BIAF', '부천국제만화축제',
]

// 게임/코스프레/서브컬처 관련 일반 키워드 — 프랜차이즈명 없이 이 단어만 걸리면 confidence: low
// (일반 연극·전시 데이터셋이라 '게임' 단독으로는 무관한 결과가 섞일 수 있어 사람 검수로 넘긴다).
const GENERIC_KEYWORDS = [
  '게임', '게임음악', '코스프레', '코스튬', '서브컬처', '애니메이션', '애니송', '성우', 'e스포츠', '이스포츠',
  '만화축제', '만화페스티벌',
]

function stripHtml(html = '') {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function rowText(row) {
  return `${row.title ?? ''} ${stripHtml(row.description ?? '')}`
}

function looksRelevant(row) {
  const text = rowText(row)
  return FRANCHISE_KEYWORDS.some(k => text.includes(k)) || GENERIC_KEYWORDS.some(k => text.includes(k))
}

// 코스프레·서브컬처 행사 신호 — FRANCHISE_KEYWORDS 중 코스프레 계열만 별도 분리
const COSPLAY_SIGNALS = ['코스프레', '코스튬', '서브컬처', '코믹월드', 'AGF', '일러스타페스']
// 게임전시 신호 — 지스타 등 게임쇼·전시 계열
const GAME_EXPO_SIGNALS = ['지스타', '게임 전시', '게임쇼']

// KINTEX와 동일한 방식으로 category를 결정한다. KCISA는 공연·전시 6만여 건을 아우르는
// 일반 데이터셋이라 '게임음악' 하드코딩이 아니라 키워드로 구분해야 한다.
function estimateCategory(text) {
  if (COSPLAY_SIGNALS.some(k => text.includes(k))) return '코스프레'
  if (GAME_EXPO_SIGNALS.some(k => text.includes(k))) return '게임전시'
  return '게임음악'
}

function estimateConfidence(text) {
  if (FRANCHISE_KEYWORDS.some(k => text.includes(k))) return 'high'
  return 'low' // GENERIC_KEYWORDS만 걸린 경우 — 사람 검수로 최종 판단 필요
}

// "20260918 ~ 20260918" -> { start: "2026-09-18", end: "2026-09-18" }
function parseEventPeriod(eventPeriod) {
  if (!eventPeriod) return { start: null, end: null }
  const [rawStart, rawEnd] = eventPeriod.split('~').map(s => s?.trim())
  const toIso = (compact) => (compact?.length === 8
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : null)
  const start = toIso(rawStart)
  return { start, end: toIso(rawEnd) ?? start }
}

async function requestCulture(params) {
  const url = new URL(CULTURE_API_URL)
  url.searchParams.set('serviceKey', process.env.CULTURE_PERFORMANCE_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`문화예술공연통합 요청 실패: HTTP ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml)

  const code = parsed?.response?.header?.resultCode
  if (code && code !== '0000') {
    throw new Error(`문화예술공연통합 API 에러: ${parsed?.response?.header?.resultMsg ?? code}`)
  }

  const body = parsed?.response?.body
  return {
    rows: asArray(body?.items?.item),
    total: Number(body?.totalCount ?? 0),
  }
}

function buildSourceUrl(row) {
  // url(상세 페이지)이 사실상 항상 있지만, 혹시 비어 있으면 제목+기간으로 대체 키를 만든다.
  return row.url || `culture-performance://${encodeURIComponent(row.title ?? '')}-${row.eventPeriod ?? ''}`
}

export async function fetchCulturePerformanceCandidates() {
  const todayCompact = formatDateCompact(new Date())

  const matched = []
  let fetched = 0

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    let page
    try {
      page = await requestCulture({ numOfRows: ROWS_PER_PAGE, pageNo })
    } catch (err) {
      console.error(`[문화예술공연통합] ${pageNo}페이지 조회 실패:`, err.message)
      break
    }
    if (page.rows.length === 0) break

    const stillRelevant = page.rows.filter(row => {
      const { end } = parseEventPeriod(row.eventPeriod)
      if (end && end.replaceAll('-', '') < todayCompact) return false // 이미 끝난 공연 제외
      return looksRelevant(row)
    })

    // 이 페이지에 "아직 안 끝난" 행이 하나도 없으면 그 아래는 전부 지난 행사로 보고 멈춘다
    // (등록 최신순 정렬 가정 — 파일 상단 주석 참고).
    const anyUpcoming = page.rows.some(row => {
      const { end } = parseEventPeriod(row.eventPeriod)
      return !end || end.replaceAll('-', '') >= todayCompact
    })

    matched.push(...stillRelevant)

    fetched += page.rows.length
    if (!anyUpcoming) break
    if (fetched >= page.total || page.rows.length < ROWS_PER_PAGE) break
  }

  return matched.map(row => ({
    source_name: '문화예술공연통합',
    source_url: buildSourceUrl(row),
    source_title: row.title ?? null,
    published_at: null,
    raw: row,
  }))
}

// CNV_060 원본 필드를 event_drafts.extracted 스키마로 기계적으로 매핑한다 (LLM 호출 없음).
export function buildCulturePerformanceDraft(candidate) {
  const raw = candidate.raw
  const text = rowText(raw)
  const { start, end } = parseEventPeriod(raw.eventPeriod)

  return EventExtractionSchema.parse({
    is_event: true,
    title: raw.title ?? null,
    category: estimateCategory(text),
    start_date: start,
    end_date: end,
    venue: raw.eventSite ?? null,
    venue_address: null, // 응답에 주소 필드 없음 (장소명만 제공)
    organizer: null, // contactPoint는 전화번호/문의처라 조직명으로 쓰기 부적절해 비움
    description: stripHtml(raw.description ?? '').slice(0, 200) || null,
    ticket_url: null,
    ticket_open_date: null,
    admission_fee: raw.charge || null,
    website: raw.url ?? null,
    tags: ['문화예술공연통합'],
    confidence: estimateConfidence(text),
  })
}
