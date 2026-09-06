// KINTEX(킨텍스) 행사 일정 오픈API(경기데이터드림, data.gg.go.kr)에서 게임/애니메이션/코스프레
// 관련 행사만 걸러 crawl.mjs와 동일한 형태의 "후보"로 변환한다. KOPIS와 마찬가지로 이미
// 구조화된 공식 데이터라 Groq를 호출하지 않고 필드를 그대로 매핑하며, "진짜 관련 행사인지"는
// 키워드 매칭 기반이라 confidence로 신뢰도를 표시해 관리자 검수에서 최종 판단하도록 한다.
//
// 환경변수: KINTEX_API_KEY (data.gg.go.kr 마이페이지 > 오픈API 활용신청 현황에서 발급)
//
// 서비스명/필드는 실제 서비스키로 직접 호출해 확인함 (2026-09-04):
//   요청: https://openapi.gg.go.kr/KintexEventFixatn?KEY=...&Type=xml&pIndex=1&pSize=100
//   응답 row: EVENT_NM_INFO(행사명), EVENT_PERD(행사기간, "YYYY-MM-DD~YYYY-MM-DD"),
//             EVENT_PLC(행사장소, 전시홀명), HOST_INST_DTLS(주최기관), MNGT_INST_DTLS(주관기관),
//             TELNO, FAXNO, HMPG_URL(홈페이지)
// 주의: User-Agent 없이 요청하면 WAF에 "보안 정책에 의해 차단" 되어 막힌다 (확인함) — 반드시
// 브라우저처럼 보이는 User-Agent를 붙일 것.
import { EventExtractionSchema } from './schema.mjs'
import { xmlParser, asArray } from './xml-utils.mjs'

const KINTEX_API_URL = 'https://openapi.gg.go.kr/KintexEventFixatn'
const UA = 'Mozilla/5.0 (compatible; EventMapCrawler/1.0; +https://github.com)'

const ROWS_PER_PAGE = 100
const MAX_PAGES = 5 // 안전장치 — 전체 등록 건수가 몇백 건을 넘어갈 일은 없음

// 행사명·주최/주관기관에 이 단어가 있으면 게임/코스프레/서브컬처 행사 후보로 본다.
const GENERIC_KEYWORDS = [
  '게임', '코스프레', '코스튬', '서브컬처', '애니메이션', '이스포츠', 'e스포츠',
  '코믹월드', 'AGF', '일러스타페스', '팬 페스티벌', '팬페스티벌',
  'WONDERLIVET', '코코페', '만화축제', '만화페스티벌',
]

// "쿠키런: 킹덤 5주년 팬 페스티벌"처럼 제목에 '게임' 등이 안 들어가는 게임사 자체 팬 행사를
// 잡기 위한 프랜차이즈/게임사 이름 — 단독으로도 신뢰도 높은 신호(confidence: high).
const FRANCHISE_KEYWORDS = [
  '쿠키런', '리그오브레전드', '오버워치', '원신', '붕괴', '스타레일', '젠레스', '명조', '이환',
  '블루아카이브', '니케', '메이플스토리', '던전앤파이터', '로스트아크', '리니지', '배틀그라운드',
  '검은사막', '데브시스터즈', '넥슨', '넷마블', '크래프톤', '스마일게이트', '펄어비스',
  '카카오게임즈', '위메이드', '그라비티', '호요버스',
]

const COSPLAY_SIGNALS = ['코스프레', '코스튬', '서브컬처', '애니메이션', '코믹월드', 'AGF', '일러스타페스']

function rowText(row) {
  return `${row.EVENT_NM_INFO ?? ''} ${row.HOST_INST_DTLS ?? ''} ${row.MNGT_INST_DTLS ?? ''}`
}

function looksLikeGameEvent(row) {
  const text = rowText(row)
  return GENERIC_KEYWORDS.some(k => text.includes(k)) || FRANCHISE_KEYWORDS.some(k => text.includes(k))
}

// saveDraft()의 shouldAutoApprove()는 confidence:'medium'도 start_date·venue만
// 있으면 바로 승인하는데, KINTEX는 EVENT_PLC가 없으면 venue를 'KINTEX'로 채우고
// EVENT_PERD도 항상 있어서 둘 다 항상 참이 된다 — 즉 'medium'을 쓰면 'high'와
// 다를 바 없이 항상 자동 승인돼버린다. 그래서 확실한 신호(FRANCHISE_KEYWORDS)만
// 자동 승인(high)하고, 나머지는 전부 검수로 보낸다(low) — 중간 등급을 두지 않는다.
function estimateConfidence(text) {
  if (FRANCHISE_KEYWORDS.some(k => text.includes(k))) return 'high'
  return 'low' // 일반 키워드만 걸린 경우 — 사람 검수로 최종 판단 필요
}

// "2026-01-16~2026-01-25" -> { start: '2026-01-16', end: '2026-01-25' }
function parsePeriod(perd) {
  if (!perd) return { start: null, end: null }
  const [start, end] = perd.split('~').map(s => s?.trim())
  return { start: start || null, end: end || start || null }
}

// 응답에 행사 고유 ID가 없어서, 행사명+기간을 dedup 키로 쓴다.
function buildSourceUrl(row) {
  return `kintex-event://${encodeURIComponent(row.EVENT_NM_INFO ?? '')}/${row.EVENT_PERD ?? ''}`
}

async function fetchKintexPage(pIndex) {
  const url = new URL(KINTEX_API_URL)
  url.searchParams.set('KEY', process.env.KINTEX_API_KEY)
  url.searchParams.set('Type', 'xml')
  url.searchParams.set('pIndex', String(pIndex))
  url.searchParams.set('pSize', String(ROWS_PER_PAGE))

  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml)
  const root = parsed?.KintexEventFixatn

  const code = root?.head?.RESULT?.CODE
  if (code && code !== 'INFO-000') {
    throw new Error(`KINTEX API 에러: ${root?.head?.RESULT?.MESSAGE ?? code}`)
  }

  return {
    rows: asArray(root?.row),
    total: Number(root?.head?.list_total_count ?? 0),
  }
}

export async function fetchKintexCandidates() {
  const matched = []
  let fetched = 0

  for (let pIndex = 1; pIndex <= MAX_PAGES; pIndex++) {
    let page
    try {
      page = await fetchKintexPage(pIndex)
    } catch (err) {
      console.error(`[킨텍스] ${pIndex}페이지 조회 실패:`, err.message)
      break
    }

    matched.push(...page.rows.filter(looksLikeGameEvent))
    fetched += page.rows.length
    if (fetched >= page.total || page.rows.length < ROWS_PER_PAGE) break // 마지막 페이지
  }

  return matched.map(row => ({
    source_name: 'KINTEX',
    source_url: buildSourceUrl(row),
    source_title: row.EVENT_NM_INFO ?? null,
    published_at: null,
    raw: row,
  }))
}

// KINTEX 원본 필드를 event_drafts.extracted 스키마로 기계적으로 매핑한다 (LLM 호출 없음).
export function buildKintexDraft(candidate) {
  const raw = candidate.raw
  const text = rowText(raw)
  const { start, end } = parsePeriod(raw.EVENT_PERD)
  const organizer = [raw.HOST_INST_DTLS, raw.MNGT_INST_DTLS].map(s => s?.trim()).find(Boolean) ?? null

  return EventExtractionSchema.parse({
    is_event: true,
    title: raw.EVENT_NM_INFO ?? null,
    category: COSPLAY_SIGNALS.some(k => text.includes(k)) ? '코스프레' : '게임전시',
    start_date: start,
    end_date: end,
    venue: raw.EVENT_PLC ? `KINTEX ${raw.EVENT_PLC}` : 'KINTEX',
    venue_address: '경기도 고양시 일산서구 킨텍스로 217-60',
    organizer,
    description: null,
    ticket_url: raw.HMPG_URL || null,
    ticket_open_date: null,
    admission_fee: null,
    website: raw.HMPG_URL || null,
    tags: ['킨텍스', raw.EVENT_PLC].filter(Boolean),
    confidence: estimateConfidence(text),
  })
}
