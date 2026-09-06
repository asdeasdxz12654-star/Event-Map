// 영상물등급위원회 "외국인 국내 공연추천 정보 조회 서비스"에서 일본 애니송/J-POP 아티스트
// 내한공연과 게임/애니 관련 콘서트를 찾아 crawl.mjs의 후보로 변환한다.
//
// 이 API는 원래 외국인 연예인이 국내에서 공연하려고 비자를 받을 때 거치는 "공연추천" 등록
// 데이터라(공연법·출입국관리법 근거), 2009년부터 누적 6만여 건이 쌓인 실제 내한공연 정보다.
// 다만 응답에 국적·장르 필드가 아예 없어서 제목(oriTitle) 텍스트만으로 판단해야 한다 — 그래서
// 유명 일본 애니송/성우/J-POP 아티스트 이름을 직접 목록으로 관리한다(KOPIS의
// FRANCHISE_KEYWORDS와 같은 방식). KOPIS와 마찬가지로 구조화된 공식 데이터라 Groq를 호출하지
// 않고 필드를 그대로 매핑하며, confidence로 신뢰도를 표시해 관리자 검수에서 최종 판단한다.
//
// 환경변수: KMRB_API_KEY (data.go.kr에서 발급받은 URL 인코딩된 인증키를 그대로 사용)
//
// 엔드포인트는 data.go.kr 상세페이지에 문서화되어 있지 않아서, 페이지에 숨어있는 스웨거
// 스펙(JSON)을 직접 찾아 확인함 (2026-09-04):
//   https://apis.data.go.kr/B551008/pfm/v1/pfm_search
//     ?serviceKey=...&pageNo=1&numOfRows=100&stDate=YYYYMMDD&edDate=YYYYMMDD
//   (stDate/edDate는 "공연추천 시작일/종료일" — 실제로는 등록(rtDate) 배치 날짜 범위로,
//    영등위가 매주 배치로 처리해서 같은 배치의 rtDate가 몰려 있는 걸 확인함. 그래서
//    "최근 며칠간 새로 등록된 추천"을 훑는 용도로 최근 LOOKBACK_DAYS만큼의 범위를 준다.)
// 응답 필드(item): oriTitle(공연명), PfmPlaceName(공연장소), contrStartDate/contrEndDate
//   (공연기간, "YYYY-MM-DD"), rtNo(추천번호, dedup 키로 사용), rtDate(추천일자), kindName
//   (공연물 종류), Gubun(분류), minorMalefYn(연소자유해여부)
import { EventExtractionSchema } from './schema.mjs'
import { xmlParser, asArray, formatDateCompact } from './xml-utils.mjs'

const KMRB_API_URL = 'https://apis.data.go.kr/B551008/pfm/v1/pfm_search'
const ROWS_PER_PAGE = 100
const MAX_PAGES = 8 // 안전장치 — 실측 기준 30일 범위에 250건 안팎이라 800건까지는 여유 있음

// 최근 등록된 추천만 본다 (dedup은 rtNo 기준이라 매일 겹쳐 조회해도 무방 — 크론이 매일 도니까
// 이 범위는 "새 등록을 놓치지 않을 최소 폭"이면 충분하다. 너무 넓히면 페이지 수가 늘어나
// MAX_PAGES에 걸려 최신 항목을 못 볼 수 있다 — 영등위가 배치(rtDate)를 오름차순으로 반환함).
const LOOKBACK_DAYS = 30

// 유명 일본 애니송/성우/J-POP 아티스트·밴드 이름 — 로마자 투어명 표기가 많아서 영문도 같이
// 넣는다. 단독으로도 신뢰도 높은 신호(confidence: high).
const JAPANESE_ARTIST_KEYWORDS = [
  '요네즈 켄시', 'KENSHI YONEZU', '아이묘', 'AIMYON', '요아소비', 'YOASOBI',
  '킹누', 'KING GNU', '미세스그린애플', 'MRS. GREEN APPLE',
  '오피셜히게단디즘', 'OFFICIAL HIGE DANDISM',
  '하마사키 아유미', 'AYUMI HAMASAKI', '라르크앙시엘', "L'ARC~EN~CIEL",
  '원오크락', 'ONE OK ROCK', '스피츠', 'SPITZ',
  'LiSA', '하야시바라 메구미', 'MEGUMI HAYASHIBARA', '카지 유우키', 'YUKI KAJI',
  '카게야마 히로노부', 'HIRONOBU KAGEYAMA', 'JAM PROJECT', '하나자와 카나', 'KANA HANAZAWA',
  '야마자키 마사요시', 'MASAYOSHI YAMAZAKI', '미즈키 나나', 'NANA MIZUKI',
  '야마다 료스케', 'RYOSUKE YAMADA',
]

// 게임/애니 관련 콘서트를 잡기 위한 일반 키워드 (일본 아티스트가 아니어도 매칭).
const GAME_ANIME_KEYWORDS = [
  '애니메이션', '애니송', '성우', '게임', '지스타', '코믹월드', 'AGF', '일러스타페스',
  '서브컬처', '코스프레',
]

function rowText(row) {
  return `${row.oriTitle ?? ''} ${row.kindName ?? ''}`
}

function looksRelevant(row) {
  const text = rowText(row)
  return JAPANESE_ARTIST_KEYWORDS.some(k => text.includes(k)) || GAME_ANIME_KEYWORDS.some(k => text.includes(k))
}

// saveDraft()의 shouldAutoApprove()는 confidence:'medium'도 start_date·venue만
// 있으면 바로 승인하는데, 이 API는 공연장(PfmPlaceName)·공연일이 거의 항상 채워져
// 있어서 'medium'을 쓰면 'high'와 다를 바 없이 자동 승인돼버린다. 그래서 확실한
// 신호(아티스트 실명)만 자동 승인(high)하고, 일반 게임/애니 키워드만 걸린 경우는
// 전부 검수로 보낸다(low) — 중간 등급을 두지 않는다 (kintex.mjs와 동일한 이유).
function estimateConfidence(text) {
  if (JAPANESE_ARTIST_KEYWORDS.some(k => text.includes(k))) return 'high'
  return 'low' // GAME_ANIME_KEYWORDS만 걸린 경우 — 사람 검수로 최종 판단 필요
}

function buildSourceUrl(row) {
  return `kmrb-pfm://${row.rtNo ?? encodeURIComponent(row.oriTitle ?? '')}`
}

async function fetchKmrbPage(pIndex, stDate, edDate) {
  // serviceKey는 data.go.kr에서 받은 URL 인코딩된 키 — searchParams.set()을 쓰면
  // %2B가 %252B로 이중 인코딩되어 인증 실패함. 수동으로 query string에 붙인다.
  const params = new URLSearchParams({ pageNo: String(pIndex), numOfRows: String(ROWS_PER_PAGE), stDate, edDate })
  const fullUrl = `${KMRB_API_URL}?serviceKey=${process.env.KMRB_API_KEY}&${params.toString()}`

  const res = await fetch(fullUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml)
  const body = parsed?.response?.body

  const code = parsed?.response?.header?.resultCode
  if (code && code !== '00') {
    throw new Error(`KMRB API 에러: ${parsed?.response?.header?.resultMsg ?? code}`)
  }

  return {
    rows: asArray(body?.items?.item),
    total: Number(body?.totalCount ?? 0),
  }
}

export async function fetchKmrbCandidates() {
  const today = new Date()
  const from = new Date(today.getTime() - LOOKBACK_DAYS * 86400000)
  const stDate = formatDateCompact(from)
  const edDate = formatDateCompact(today)
  const todayStr = edDate

  const matched = []
  let fetched = 0

  for (let pIndex = 1; pIndex <= MAX_PAGES; pIndex++) {
    let page
    try {
      page = await fetchKmrbPage(pIndex, stDate, edDate)
    } catch (err) {
      console.error(`[영등위] ${pIndex}페이지 조회 실패:`, err.message)
      break
    }

    matched.push(...page.rows.filter(row => {
      // 이미 끝났거나 과거인 공연추천은 제외 (비자용 등록이라 보통 미래 날짜지만 안전장치)
      if (row.contrStartDate && row.contrStartDate.replaceAll('-', '') < todayStr) return false
      return looksRelevant(row)
    }))

    fetched += page.rows.length
    if (fetched >= page.total || page.rows.length < ROWS_PER_PAGE) break // 마지막 페이지
  }

  return matched.map(row => ({
    source_name: '영등위 공연추천',
    source_url: buildSourceUrl(row),
    source_title: row.oriTitle ?? null,
    published_at: null,
    raw: row,
  }))
}

// KMRB PfmPlaceName에 "장충체육관(09/13)"처럼 날짜가 괄호 안에 붙어 오는 경우가 있다.
// 공연장 이름만 남기고 날짜 표기를 제거한다.
function cleanVenueName(name) {
  if (!name) return null
  return name.replace(/\s*\(\d{1,2}\/\d{1,2}\)/g, '').trim() || null
}

// KMRB 원본 필드를 event_drafts.extracted 스키마로 기계적으로 매핑한다 (LLM 호출 없음).
export function buildKmrbDraft(candidate) {
  const raw = candidate.raw
  const text = rowText(raw)

  return EventExtractionSchema.parse({
    is_event: true,
    title: raw.oriTitle ?? null,
    category: '게임음악',
    start_date: raw.contrStartDate ?? null,
    end_date: raw.contrEndDate ?? raw.contrStartDate ?? null,
    venue: cleanVenueName(raw.PfmPlaceName),
    venue_address: null,
    organizer: null,
    description: null,
    ticket_url: null,
    ticket_open_date: null,
    admission_fee: null,
    website: null,
    tags: ['영등위공연추천', raw.kindName].filter(Boolean),
    confidence: estimateConfidence(text),
  })
}
