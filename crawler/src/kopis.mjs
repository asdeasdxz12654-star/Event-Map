// KOPIS(공연예술통합전산망, 예술경영지원센터) 오픈API에서 게임음악(콘서트/오케스트라 등) 관련
// 공연을 찾아 crawl.mjs와 동일한 형태의 "후보"로 변환한다. 실제 등록/게시는 항상
// event_drafts 검수 큐를 거친다 (KOPIS가 공식 API라도 "게임음악" 여부는 키워드 매칭 기반 추정).
//
// RSS 경로(crawl.mjs)와 달리 여기는 Claude를 호출하지 않는다 — KOPIS는 이미 구조화된 공식
// 데이터라 자유 텍스트를 해석할 필요가 없고, LLM 비용 없이도 필드를 그대로 매핑할 수 있다.
// 대신 "진짜 게임 관련인지" 판단을 LLM에 맡길 수 없으므로, 키워드 매칭을 더 보수적으로 하고
// (아래 looksLikeGameMusic) confidence로 신뢰도를 표시해 사람 검수에서 걸러내도록 한다.
//
// 환경변수: KOPIS_API_KEY (data.go.kr 또는 kopis.or.kr에서 무료 발급)
//
// 파라미터명/응답 필드명은 실 서비스키로 목록+상세 조회를 직접 호출해 확인함 (2026-09-03).
// 목록 응답: mt20id, prfnm, prfpdfrom, prfpdto, fcltynm, poster, area, genrenm, openrun, prfstate
// 상세 응답: 위 필드 + prfcast, entrpsnmP/H/A/S, pcseguidance, sty(줄거리/프로그램), mt10id,
//           relates.relate.relateurl (최상위 필드가 아니라 중첩 객체/배열 안에 있음, 아래 getRelateUrl 참고)
import { XMLParser } from 'fast-xml-parser'
import { EventExtractionSchema } from './schema.mjs'

const KOPIS_BASE_URL = 'https://kopis.or.kr/openApi/restful/pblprfr'
const KOPIS_DETAIL_VIEW_URL = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do'

// 조회 기간: 오늘부터 +90일 (예매 오픈 전 행사도 미리 잡히도록 넉넉하게)
const LOOKAHEAD_DAYS = 90
// 페이지당 건수 / 안전장치용 최대 페이지 수 (장르코드로 서버 사이드 필터링을 하지 않으므로
// 전체 공연이 대상이 될 수 있어 상한을 둔다)
const ROWS_PER_PAGE = 100
const MAX_PAGES = 10

// 게임 프랜차이즈 이름 — 단독으로도 신뢰도 높은 신호 (confidence: high)
// 주의: 짧은 단어는 무관한 한국어 단어와 우연히 겹칠 수 있다 (예: '니어' 단독은 '시니어'/
// '주니어'에 걸림, '동방' 단독은 '동방신기'에 걸림 — 실제 KOPIS 데이터로 확인해서 뺐다).
// 그래서 애매한 짧은 이름은 더 구체적인 표기로 넣는다.
const FRANCHISE_KEYWORDS = [
  '파이널판타지', '젤다', '포켓몬', '스타크래프트', '워크래프트', '디아블로',
  '리그오브레전드', '오버워치', '원신', '동방프로젝트', '니어:오토마타', '니어 오토마타',
  '리니지', '메이플스토리', '던전앤파이터', '블레이드앤소울', '로스트아크',
]

// '게임'이 명시적으로 들어간 경우만 게임음악 후보로 본다. 처음엔 '오케스트라'/'OST'/'콘서트'만
// 단독으로도 매칭시켰는데, 실제 KOPIS 500건 표본으로 확인해보니 전부 게임과 무관한 일반 클래식
// 공연이었다 (예: "제17회 MS필하모닉 오케스트라 정기연주회"). 그래서 '게임'이 없는 일반 음악
// 키워드는 후보에서 뺐다 — LLM 없이 걸러야 하니 재현율보다 정밀도를 우선한다.
function looksLikeGameMusic(entry) {
  const text = `${entry.prfnm ?? ''} ${entry.genrenm ?? ''}`
  return text.includes('게임') || FRANCHISE_KEYWORDS.some(k => text.includes(k))
}

function estimateConfidence(text) {
  if (FRANCHISE_KEYWORDS.some(k => text.includes(k))) return 'high'
  if (text.includes('게임음악') || text.includes('게임 콘서트')) return 'medium'
  return 'low' // '게임'만 걸린 경우 — 사람 검수로 최종 판단 필요
}

const xmlParser = new XMLParser({ ignoreAttributes: false })

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// "2026.10.09" -> "2026-10-09" (event_drafts.extracted.start_date/end_date 형식에 맞춤)
function parseKopisDate(d) {
  return d ? d.replaceAll('.', '-') : null
}

// fast-xml-parser는 항목이 1개면 객체, 여러 개면 배열로 반환한다 -> 항상 배열로 정규화
function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// relateurl은 최상위 필드가 아니라 relates.relate(단일 객체 또는 배열) 안에 중첩되어 있다.
// (실 서비스키로 상세 조회 응답을 확인해 확정함)
function getRelateUrl(raw) {
  const relate = asArray(raw.relates?.relate)[0]
  return relate?.relateurl ?? null
}

function buildKopisSourceUrl(mt20id) {
  return `${KOPIS_DETAIL_VIEW_URL}?menuId=MNU_00020&mt20id=${encodeURIComponent(mt20id)}`
}

async function requestKopis(path, params) {
  const url = new URL(path)
  url.searchParams.set('service', process.env.KOPIS_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`KOPIS 요청 실패: HTTP ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml)

  const err = parsed?.dbs?.db?.errmsg
  if (err) throw new Error(`KOPIS API 에러: ${err}`)

  return parsed
}

async function fetchKopisList({ stdate, eddate, cpage, rows }) {
  const parsed = await requestKopis(KOPIS_BASE_URL, { stdate, eddate, cpage, rows })
  return asArray(parsed?.dbs?.db)
}

async function fetchKopisDetail(mt20id) {
  const parsed = await requestKopis(`${KOPIS_BASE_URL}/${encodeURIComponent(mt20id)}`, {})
  return parsed?.dbs?.db ?? null
}

export async function fetchKopisCandidates() {
  const today = new Date()
  const to = new Date(today.getTime() + LOOKAHEAD_DAYS * 86400000)
  const stdate = formatDate(today)
  const eddate = formatDate(to)

  const matched = []
  for (let cpage = 1; cpage <= MAX_PAGES; cpage++) {
    let page
    try {
      page = await fetchKopisList({ stdate, eddate, cpage, rows: ROWS_PER_PAGE })
    } catch (err) {
      console.error(`[KOPIS] ${cpage}페이지 조회 실패:`, err.message)
      break
    }
    if (page.length === 0) break
    matched.push(...page.filter(looksLikeGameMusic))
    if (page.length < ROWS_PER_PAGE) break // 마지막 페이지
  }

  const candidates = []
  for (const entry of matched) {
    if (!entry.mt20id) continue
    let detail
    try {
      detail = await fetchKopisDetail(entry.mt20id)
    } catch (err) {
      console.error(`[KOPIS] 상세 조회 실패 (${entry.mt20id}):`, err.message)
      continue
    }
    candidates.push({
      source_name: 'KOPIS',
      source_url: buildKopisSourceUrl(entry.mt20id),
      source_title: entry.prfnm ?? detail?.prfnm ?? null,
      published_at: null,
      raw: { ...entry, ...detail },
    })
  }
  return candidates
}

// sty(프로그램/줄거리 소개)와 장르·공연장 정보로 짧은 설명을 조립한다 (LLM 없이).
function buildDescription(raw) {
  const head = [raw.genrenm, raw.fcltynm].filter(Boolean).join(' · ')
  const firstLine = raw.sty?.split('\n').map(s => s.trim()).find(Boolean)
  const desc = [head, firstLine].filter(Boolean).join('. ')
  return desc ? desc.slice(0, 200) : null
}

// KOPIS 원본 필드를 event_drafts.extracted 스키마(EventExtractionSchema)로 기계적으로 매핑한다.
// LLM 판단이 없으므로 is_event는 항상 true(=검수 큐에 올림)이고, "진짜 게임 관련인지"는
// confidence로만 표시해 관리자 검수 페이지에서 사람이 최종 판단한다.
export function buildKopisDraft(candidate) {
  const raw = candidate.raw
  const text = `${raw.prfnm ?? ''} ${raw.genrenm ?? ''}`
  const organizer = [raw.entrpsnmP, raw.entrpsnmH].map(s => s?.trim()).find(Boolean) ?? null

  return EventExtractionSchema.parse({
    is_event: true,
    title: raw.prfnm ?? null,
    category: '게임음악',
    start_date: parseKopisDate(raw.prfpdfrom),
    end_date: parseKopisDate(raw.prfpdto ?? raw.prfpdfrom),
    venue: raw.fcltynm ?? null,
    venue_address: null, // KOPIS 목록/상세 응답엔 주소가 없음 (공연장명만 제공)
    organizer,
    description: buildDescription(raw),
    ticket_url: getRelateUrl(raw),
    ticket_open_date: null,
    admission_fee: raw.pcseguidance ?? null,
    website: null,
    tags: ['게임음악', raw.genrenm].filter(Boolean),
    confidence: estimateConfidence(text),
  })
}
