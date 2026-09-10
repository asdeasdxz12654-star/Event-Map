// 전시장 행사일정을 발견 소스로 쓴다 (벡스코·SETEC·수원메쎄).
//
// 왜 이 소스인가
//   뉴스 검색과 서브컬처 일정표만으로는 새 행사를 놓친다. 전시장은 행사를 실제로
//   유치한 주체라, 기사가 나기 훨씬 전에 일정이 확정돼 올라온다. 우리가 다루는
//   행사 대부분이 이 네 곳(킨텍스·벡스코·SETEC·수원메쎄)에서 열린다.
//   실제로 SETEC 일정표에는 "디. 페스타 2026-10-03 ~ 10-04"가, 수원메쎄에는
//   "코믹월드 338 수원 10-24 ~ 10-25"가 그대로 올라와 있다.
//
// 킨텍스는 여기 없다 — 경기데이터드림 오픈API로 이미 받고 있다 (kintex.mjs).
// 울산전시컨벤션센터(UECO)도 빠져 있다. 일정 페이지가 Nuxt SPA라 fetch로는 빈 껍데기만
// 오고, 데이터를 주는 API가 같은 도메인에 노출돼 있지 않다. 서버 렌더링으로 바뀌거나
// 공개 API가 생기면 아래 VENUES에 한 줄 추가하면 된다.
//
// 검수 정책
//   전시장 일정표에는 창업박람회·학술대회·입주박람회 등 우리 범위 밖 행사가 훨씬 많다.
//   그래서 제목 키워드로 1차로 거르고, 남은 것도 confidence를 'low'로 고정해서
//   자동 승인되지 않게 한다 (관리자가 /admin/drafts에서 판단).
//   이미 등록된 행사도 후보로 올라온다. 전시장은 행사명을 다르게 적는 일이 흔해서
//   ("지스타 2026" ↔ "2026 국제게임전시회 지스타") 제목+시작일 중복 방지에 안 걸리는
//   경우가 있는데, 그건 검수 화면에서 보고 반려하면 된다. source_url로 중복 방지가
//   되므로 한 번 반려한 항목이 다시 올라오지는 않는다.
import { EventExtractionSchema } from './schema.mjs'
import { todayKST } from './date-kst.mjs'
import { decodeEntities, fetchHtml } from './util.mjs'

// 전시장 일정표에서 "우리 사이트가 다루는 행사"로 볼 제목 키워드.
// 없는 것보다 좁게 잡는다 — 놓친 행사는 다른 소스(뉴스·서브컬처 일정표)에서 잡히지만,
// 여기서 헐겁게 받으면 검수 대기 목록이 창업박람회로 뒤덮인다.
const RELEVANT_KEYWORDS = [
  '게임', '지스타', 'gstar', 'e스포츠', 'esports', '이스포츠',
  '애니', '애니메이션', '코스프레', '코스어', '코믹', '만화', '웹툰', '카툰',
  '일러스트', '일러스타', '캐릭터', '서브컬처', '동인', '피규어', '토이', '굿즈',
  '문구전', '덕질', 'agf', '오타쿠', '팬덤', '아트토이', '프라모델',
  // "페스타"만으로 받으면 수원주류페스타·경기미쌀디저트페스타·궁디팡팡 캣페스타가
  // 전부 딸려 온다(실제로 첫 실행에서 7건 중 3건이 그것이었다). 우리 범위의 페스타는
  // 이름을 콕 집어 받고, 새로 생기는 건 서브컬처 일정표 쪽에서 잡는다.
  '디. 페스타', '디.페스타', '디페스타',
]

// 같은 전시장에서 열려도 우리 범위가 아닌 게 확실한 행사는 미리 뺀다.
// ("게임"이 들어가도 취업박람회면 아니다)
const EXCLUDE_KEYWORDS = ['채용', '취업', '창업', '입주', '분양', '학술', '컨퍼런스', '세미나', '설명회', '연수', '포럼']

function isRelevant(title) {
  const lower = String(title).toLowerCase()
  if (EXCLUDE_KEYWORDS.some(k => lower.includes(k))) return false
  return RELEVANT_KEYWORDS.some(k => lower.includes(k))
}

// 제목으로 카테고리를 추정한다. 어차피 confidence가 low라 관리자가 최종 판단한다.
const CATEGORY_RULES = [
  { category: '일러스트', keywords: ['일러스트', '일러스타', '문구전', '캐릭터', '아트토이', '아트페어', '디자인페어'] },
  { category: '게임음악', keywords: ['콘서트', '오케스트라', '내한', '라이브', 'live'] },
  { category: '코스프레', keywords: ['코믹', '코스', '동인', '온리전', '페스타', '덕질', 'agf', '애니', '만화'] },
  { category: '게임전시', keywords: ['게임', '지스타', 'gstar', 'e스포츠', 'esports', '피규어', '토이', '웹툰'] },
]

function inferCategory(text) {
  const lower = String(text).toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.category
  }
  return '게임전시'
}

// 오늘부터 올해 말까지의 달 목록 (YYYY, M). 전시장 캘린더가 달 단위라 필요하다.
// 내년까지 훑지 않는 건 서브컬처 일정표와 같은 이유다 — 내년 일정은 아직 확정 전인
// 경우가 많고, 해가 바뀌면 그때 잡힌다.
function monthsToScan(today = todayKST()) {
  const year = Number(today.slice(0, 4))
  const startMonth = Number(today.slice(5, 7))
  const months = []
  for (let m = startMonth; m <= 12; m++) months.push({ year, month: m })
  return months
}

function collapse(html) {
  return html.replace(/\s+/g, ' ')
}

// ── 벡스코 ────────────────────────────────────────────────────────────────
// 달력 페이지에 행사 링크(event_seq)와 제목이 들어 있고, 날짜·장소·홈페이지는
// 상세 페이지에 있다. 그래서 달력에서 제목으로 먼저 거른 뒤, 남은 것만 상세를 본다.
const BEXCO_BASE = 'https://www.bexco.co.kr'

function parseBexcoCalendar(html) {
  const found = new Map()
  const re = /<a href="([^"]*event_seq=(\d+))">\s*<span class="eventIcon[^"]*">([^<]*)<\/span>\s*<span class="txt">([^<]*)<\/span>/g
  for (const m of collapse(html).matchAll(re)) {
    const [, href, seq, type, title] = m
    if (!found.has(seq)) {
      found.set(seq, { id: seq, title: decodeEntities(title), type: decodeEntities(type), href: decodeEntities(href) })
    }
  }
  return [...found.values()]
}

export function parseBexcoDetail(html) {
  const text = collapse(html)
  const title = decodeEntities(/<h3 class="subject"><span class="stit">([^<]*)<\/span>/.exec(text)?.[1] ?? '')
  const period = /<span class="date">\s*(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(text)
  const place = decodeEntities(/class="place[^"]*"[^>]*>([^<]*)<\/a>/.exec(text)?.[1] ?? '')
  // 홈페이지 항목은 있을 때만 있다 (전시는 대개 있고, 회의·이벤트는 없다)
  const website = /<em class="ltit">홈페이지<\/em><span class="ltxt"><a href="([^"]+)"/.exec(text)?.[1] ?? null
  const organizer = decodeEntities(/<em class="ltit">주최\/주관<\/em><span class="ltxt">([^<]*)<\/span>/.exec(text)?.[1] ?? '')

  if (!period) return null
  return {
    title,
    start: `${period[1]}-${period[2]}-${period[3]}`,
    end: `${period[4]}-${period[5]}-${period[6]}`,
    place: place || null,
    website,
    organizer: organizer || null,
  }
}

async function fetchBexcoEvents() {
  const events = []
  for (const { year, month } of monthsToScan()) {
    const date = `${year}${String(month).padStart(2, '0')}01`
    const url = `${BEXCO_BASE}/kor/CMS/EventScheduleMgr/list.do?page=1&mCode=MN214&searchID=sch005&schEvent=&schListType=calendar&schCalendarDate=${date}&searchKeyword=&schStartDate=&schEndDate=`
    const listed = parseBexcoCalendar(await fetchHtml(url))
    for (const item of listed) {
      if (!isRelevant(item.title)) continue
      if (events.some(e => e.id === item.id)) continue // 여러 달에 걸친 행사
      let detail = null
      try {
        detail = parseBexcoDetail(await fetchHtml(`${BEXCO_BASE}${item.href}`))
      } catch (err) {
        console.warn(`  [벡스코] 상세 조회 실패(${item.title}): ${err.message}`)
      }
      if (!detail) continue
      events.push({
        id: item.id,
        title: detail.title || item.title,
        start: detail.start,
        end: detail.end,
        place: detail.place,
        website: detail.website,
        organizer: detail.organizer,
        url: `${BEXCO_BASE}${item.href}`,
      })
    }
  }
  return events
}

// ── SETEC ─────────────────────────────────────────────────────────────────
// 목록 페이지 하나에 예정 행사가 제목·기간·장소까지 정리돼 있다.
const SETEC_LIST_URL = 'https://setec.or.kr/front/schedule/list.do?sIdx=2038&pageIndex=&searchKeyword=&searchCondition=&searchSDate=&searchEDate='

export function parseSetecList(html) {
  const events = []
  const re = /fn_view\('(\d+)'\);[\s\S]*?<div class="txt"> <strong>([^<]*)<\/strong> <ul> <li>기간 : (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})<\/li> <li>장소 : ([^<]*)<\/li>/g
  for (const m of collapse(html).matchAll(re)) {
    const [, id, title, start, end, place] = m
    events.push({
      id,
      title: decodeEntities(title),
      start,
      end,
      place: decodeEntities(place),
      url: `https://setec.or.kr/front/schedule/view.do?sIdx=2038&idx=${id}`,
    })
  }
  return events
}

async function fetchSetecEvents() {
  return parseSetecList(await fetchHtml(SETEC_LIST_URL))
}

// ── 수원메쎄 ──────────────────────────────────────────────────────────────
// 달력 칸(td)마다 그날 열리는 행사가 들어 있다. 같은 행사(uid)가 여러 칸에 반복되므로
// 가장 이른 날과 늦은 날을 시작·종료일로 본다. 달을 넘겨 이어지는 행사는 그 달 안쪽만
// 잡히는데, 검수 화면에서 날짜를 확인하니 그대로 둔다.
const SUWONMESSE_BASE = 'https://suwonmesse.com/event_schedule/event_calendar/'

export function parseSuwonmesseCalendar(html, year, month) {
  const byUid = new Map()
  const cells = collapse(html).split('<td class="calendar-column')
  for (const cell of cells) {
    const day = /<span class="calendar-icon-day">\s*(\d{1,2})\s*<\/span>/.exec(cell)?.[1]
    if (!day) continue
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const re = /<a href="[^"]*uid=(\d+)"> <span[^>]*>([^<]*)<\/span> <div class="event-name">\s*([^<]*?)\s*<\/div>/g
    for (const m of cell.matchAll(re)) {
      const [, uid, type, title] = m
      const existing = byUid.get(uid)
      if (existing) {
        if (date < existing.start) existing.start = date
        if (date > existing.end) existing.end = date
      } else {
        byUid.set(uid, {
          id: uid,
          title: decodeEntities(title),
          type: decodeEntities(type),
          start: date,
          end: date,
          url: `${SUWONMESSE_BASE}?mod=document&kboard_calendar_year=${year}&kboard_calendar_month=${month}&uid=${uid}`,
        })
      }
    }
  }
  return [...byUid.values()]
}

async function fetchSuwonmesseEvents() {
  const events = []
  for (const { year, month } of monthsToScan()) {
    const url = `${SUWONMESSE_BASE}?mod=calendar&kboard_calendar_year=${year}&kboard_calendar_month=${month}`
    for (const event of parseSuwonmesseCalendar(await fetchHtml(url), year, month)) {
      if (events.some(e => e.id === event.id)) continue
      events.push(event)
    }
  }
  return events
}

// ── 공통 ──────────────────────────────────────────────────────────────────
const VENUES = [
  {
    key: 'bexco',
    name: '벡스코',
    venue: '벡스코',
    address: '부산광역시 해운대구 APEC로 55',
    fetchEvents: fetchBexcoEvents,
  },
  {
    key: 'setec',
    name: 'SETEC',
    venue: 'SETEC',
    address: '서울특별시 강남구 남부순환로 3104',
    fetchEvents: fetchSetecEvents,
  },
  {
    key: 'suwonmesse',
    name: '수원메쎄',
    venue: '수원메쎄',
    address: '경기도 수원시 권선구 세화로134번길 37',
    fetchEvents: fetchSuwonmesseEvents,
  },
]

export async function fetchVenueCalendarCandidates() {
  const today = todayKST()
  const yearEnd = `${today.slice(0, 4)}-12-31`
  const candidates = []

  for (const venue of VENUES) {
    let events = []
    try {
      events = await venue.fetchEvents()
    } catch (err) {
      console.warn(`  [전시장일정] ${venue.name} 조회 실패: ${err.message}`)
      continue
    }

    const picked = events.filter(e =>
      e.title && e.start &&
      (e.end ?? e.start) >= today && e.start <= yearEnd &&
      isRelevant(e.title))

    console.log(`[전시장일정] ${venue.name}: 전체 ${events.length}건 중 ${picked.length}건`)

    for (const event of picked) {
      candidates.push({
        source_name: `venue-calendar:${venue.key}`,
        // 같은 항목을 매번 다시 넣지 않도록 전시장 키와 행사 id를 담는다.
        source_url: `venue-calendar://${venue.key}/${event.id}`,
        source_title: event.title,
        published_at: null,
        raw: { ...event, venue },
      })
    }
  }

  return candidates
}

export function buildVenueCalendarDraft(candidate) {
  const e = candidate.raw
  // place는 "제1전시장 1~2홀"처럼 전시장 안의 홀 이름이라, 전시장 이름을 앞에 붙여야
  // 지도 검색(naver-local)이 좌표를 찾는다. 다만 "벡스코 전관"처럼 place에 이미
  // 전시장 이름이 들어 있으면 그대로 쓴다 ("벡스코 벡스코 전관"이 되지 않게).
  const venueName = e.place && !e.place.includes(e.venue.venue)
    ? `${e.venue.venue} ${e.place}`
    : (e.place || e.venue.venue)

  return EventExtractionSchema.parse({
    is_event: true,
    title: e.title,
    category: inferCategory(e.title),
    start_date: e.start,
    end_date: e.end || e.start,
    venue: venueName,
    venue_address: e.venue.address,
    organizer: e.organizer ?? null,
    description: null,
    ticket_url: null,
    ticket_open_date: null,
    ticket_open_time: null,
    ticket_open_note: null,
    admission_fee: null,
    // 벡스코 상세에는 행사 공식 홈페이지가 적혀 있다. 없으면 전시장 행사 페이지를 둔다 —
    // 공식 사이트를 알면 포스터 검색 정확도가 크게 달라진다(serpapi-image.mjs).
    website: e.website ?? e.url ?? null,
    tags: [e.venue.venue, e.type].filter(Boolean),
    // 전시장 일정표에는 범위 밖 행사가 훨씬 많아 자동 승인하지 않는다.
    confidence: 'low',
  })
}
