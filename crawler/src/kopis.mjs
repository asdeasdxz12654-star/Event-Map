// KOPIS(공연예술통합전산망, 예술경영지원센터) 오픈API에서 게임음악(콘서트/오케스트라 등) 관련
// 공연을 찾아 crawl.mjs와 동일한 형태의 "후보"로 변환한다. 실제 등록/게시는 항상
// event_drafts 검수 큐를 거친다 (KOPIS가 공식 API라도 "게임음악" 여부는 키워드 매칭 기반 추정).
//
// 환경변수: KOPIS_API_KEY (data.go.kr 또는 kopis.or.kr에서 무료 발급)
//
// 파라미터명/응답 필드명은 실 서비스키로 목록+상세 조회를 직접 호출해 확인함 (2026-09-03).
// 목록 응답: mt20id, prfnm, prfpdfrom, prfpdto, fcltynm, poster, area, genrenm, openrun, prfstate
// 상세 응답: 위 필드 + prfcast, entrpsnmP/H/A/S, pcseguidance, sty(줄거리/프로그램), mt10id,
//           relates.relate.relateurl (최상위 필드가 아니라 중첩 객체/배열 안에 있음, 아래 getRelateUrl 참고)
import { XMLParser } from 'fast-xml-parser'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { EventExtractionSchema } from './schema.mjs'

const KOPIS_BASE_URL = 'https://kopis.or.kr/openApi/restful/pblprfr'
const KOPIS_DETAIL_VIEW_URL = 'https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do'

// 조회 기간: 오늘부터 +90일 (예매 오픈 전 행사도 미리 잡히도록 넉넉하게)
const LOOKAHEAD_DAYS = 90
// 페이지당 건수 / 안전장치용 최대 페이지 수 (장르코드로 서버 사이드 필터링을 하지 않으므로
// 전체 공연이 대상이 될 수 있어 상한을 둔다)
const ROWS_PER_PAGE = 100
const MAX_PAGES = 10

// KOPIS는 장르코드(shcate)가 있지만 정확한 코드값이 불확실해 의존하지 않는다.
// 대신 제목/장르명에 아래 키워드가 있는지로 게임음악 공연 후보를 걸러낸다.
const KOPIS_KEYWORDS = [
  '게임', '게임음악', 'OST', '오케스트라', '게임 콘서트', '게임음악 콘서트',
  '파이널판타지', '젤다', '포켓몬', '스타크래프트', '리그오브레전드', '오버워치',
  '원신', '동방', '니어', '왕가휘무',
]

const xmlParser = new XMLParser({ ignoreAttributes: false })
const client = new Anthropic()

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// fast-xml-parser는 항목이 1개면 객체, 여러 개면 배열로 반환한다 -> 항상 배열로 정규화
function asArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
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

function looksLikeGameMusic(entry) {
  const text = `${entry.prfnm ?? ''} ${entry.genrenm ?? ''}`
  return KOPIS_KEYWORDS.some(k => text.includes(k))
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

const KOPIS_EXTRACTION_SYSTEM_PROMPT = `너는 KOPIS(공연예술통합전산망) 공식 데이터에서 "게임음악" 성격의 공연을
행사 정보로 정리하는 도우미다. 입력은 뉴스 기사가 아니라 이미 실존이 확인된 공연예술 데이터다.
제목/장르에 "게임" 관련 키워드가 포함되어 후보로 올라온 것이므로, 명백히 게임과 무관한 우연의
일치(예: 제목에 '게임'이 들어가지만 실제로는 스포츠/보드게임 등 다른 의미인 경우)가 아니라면
is_event는 true로 판단해라. 게임 프랜차이즈 이름이 정확히 일치하면 confidence를 high로,
"오케스트라"/"게임음악" 같은 일반적인 키워드로만 매칭된 경우는 medium 또는 low로 판단해라.
category는 항상 "게임음악"이다. description은 제목/장소/장르 정보를 바탕으로 한두 문장으로
자연스럽게 요약해라. 확실하지 않은 필드는 반드시 null로 남겨라 (추측해서 채우지 말 것).`

// relateurl은 최상위 필드가 아니라 relates.relate(단일 객체 또는 배열) 안에 중첩되어 있다.
// (실 서비스키로 상세 조회 응답을 확인해 확정함)
function getRelateUrl(raw) {
  const relate = asArray(raw.relates?.relate)[0]
  return relate?.relateurl ?? null
}

function buildKopisArticleText(raw) {
  const relateUrl = getRelateUrl(raw)
  return [
    `공연명: ${raw.prfnm ?? ''}`,
    `장르: ${raw.genrenm ?? ''}`,
    `기간: ${raw.prfpdfrom ?? ''} ~ ${raw.prfpdto ?? ''}`,
    `공연장: ${raw.fcltynm ?? ''}`,
    raw.prfcast?.trim() ? `출연: ${raw.prfcast}` : null,
    raw.entrpsnmP?.trim() ? `주최: ${raw.entrpsnmP}` : null,
    raw.entrpsnmH?.trim() ? `기획: ${raw.entrpsnmH}` : null,
    raw.pcseguidance ? `티켓 가격 안내: ${raw.pcseguidance}` : null,
    raw.sty ? `소개: ${raw.sty}` : null,
    relateUrl ? `관련/예매 링크: ${relateUrl}` : null,
  ].filter(Boolean).join('\n')
}

export async function extractKopisEvent(candidate) {
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 2048,
    output_config: {
      effort: 'low',
      format: zodOutputFormat(EventExtractionSchema),
    },
    system: KOPIS_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildKopisArticleText(candidate.raw) }],
  })

  const extracted = response.parsed_output
  if (extracted?.is_event) {
    extracted.category = '게임음악' // 이 소스는 게임음악 전용이므로 모델 분류에 맡기지 않음
  }
  return extracted
}
