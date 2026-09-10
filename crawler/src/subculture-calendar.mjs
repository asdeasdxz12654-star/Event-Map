// 서브컬처 행사일정(comicw.co.kr/c)에서 국내 행사를 찾아 crawl.mjs와 동일한 형태의
// "후보"로 변환한다.
//
// 왜 이 소스인가
//   뉴스 검색 기반 수집은 기사가 난 행사만 잡히고, 기사 문장에서 날짜·장소를 추출하다
//   보니 오차도 생긴다(코믹월드 335가 8/15인데 9/15로 들어와 있었다). 이 페이지는
//   코믹월드 운영사가 관리하는 종합 일정표라 날짜·장소가 정리돼 있고, 우리 DB와
//   대조했을 때 실제로 빠진 행사가 여러 건 나왔다(GXG 2026, 디페스타, 일러스트페어 등).
//
// 페이지 구조 (2026-09-10 확인)
//   <script type="application/json">{"events":[{id,title,start,end,category,region,place,url}, ...]}</script>
//   목록이 정적 HTML 안에 통째로 들어 있어서 별도 API 키 없이 파싱된다.
//
// 검수 정책
//   confidence를 'low'로 고정해 자동 승인되지 않게 한다. 이 일정표에는 우리 사이트
//   범위를 벗어나는 행사(온리전·문구 행사·해외 개최 등)도 함께 올라오므로, 관리자가
//   /admin/drafts에서 보고 승인하도록 남긴다.

import { EventExtractionSchema } from './schema.mjs'
import { todayKST } from './date-kst.mjs'

const CALENDAR_URL = 'https://comicw.co.kr/c'
const UA = 'Mozilla/5.0 (compatible; EventMapCrawler/1.0; +https://github.com)'

// 해외 개최 행사는 이 사이트 범위가 아니다 (crawl.mjs의 해외 필터와 같은 취지).
const OVERSEAS_HINTS = [
  '일본', '도쿄', '오사카', '교토', '치바', '빅 사이트', '빅사이트',
  '대만', '타이베이', '중국', '상하이', '홍콩', '싱가포르', '태국', '방콕', '미국',
]

// 제목·장소에서 카테고리를 추정한다. 확신이 낮은 분류라 confidence는 어차피 low다.
const CATEGORY_RULES = [
  { category: '일러스트', keywords: ['일러스트', '일러스타', '문구전', '캐릭터', '아트페어', '아트토이', '디자인페어'] },
  { category: '게임음악', keywords: ['콘서트', '내한', '라이브', 'live', 'tour', '투어', '오케스트라', '리사이틀'] },
  { category: '코스프레', keywords: ['코믹월드', '코스', '동인', '온리전', '페스타', '코미케', '팬시', '덕질', '스카이코드', 'agf', '애니메이션', '만화축제'] },
  { category: '게임전시', keywords: ['게임', '지스타', 'gxg', '콘텐츠', 'esports', 'e스포츠', '인디'] },
]

function inferCategory(text) {
  const lower = text.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => lower.includes(k.toLowerCase()))) return rule.category
  }
  return '게임전시'
}

function isOverseas(text) {
  return OVERSEAS_HINTS.some(k => text.includes(k))
}

// place 문자열이 "부산 해운대구 APEC로 55 벡스코 제1전시장"처럼 주소로 시작하면
// 주소와 장소명을 분리해 담는다. "SETEC"처럼 장소명만 있으면 주소는 비운다.
const REGION_PREFIX = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/

function splitPlace(place) {
  const value = (place ?? '').trim()
  if (!value) return { venue: null, address: null }
  if (REGION_PREFIX.test(value)) return { venue: value, address: value }
  return { venue: value, address: null }
}

export function parseCalendarEvents(html) {
  const match = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return []
  let data
  try {
    data = JSON.parse(match[1].trim())
  } catch {
    return []
  }
  const events = Array.isArray(data) ? data : data.events
  return Array.isArray(events) ? events : []
}

// 오늘 이후 ~ 올해 말까지의 국내 행사만 후보로 만든다.
// (내년 행사는 아직 정보가 확정되지 않은 경우가 많아 올해로 제한한다 — 해가 바뀌면 잡힌다)
export function selectUpcoming(events, today = todayKST()) {
  const yearEnd = `${today.slice(0, 4)}-12-31`
  return events.filter(e => {
    if (!e?.start || !e?.title) return false
    if (e.start < today || e.start > yearEnd) return false
    return !isOverseas(`${e.title} ${e.region ?? ''} ${e.place ?? ''}`)
  })
}

export async function fetchSubcultureCalendarCandidates() {
  const res = await fetch(CALENDAR_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    console.warn(`  [행사일정] HTTP ${res.status}`)
    return []
  }
  const html = await res.text()
  const events = parseCalendarEvents(html)
  if (events.length === 0) {
    console.warn('  [행사일정] 목록 JSON을 찾지 못했다 — 페이지 구조가 바뀌었을 수 있다')
    return []
  }

  const upcoming = selectUpcoming(events)
  console.log(`[행사일정] 전체 ${events.length}건 중 올해 남은 국내 행사 ${upcoming.length}건`)

  return upcoming.map(e => ({
    // 같은 항목을 매번 다시 넣지 않도록 캘린더 id를 source_url에 담는다.
    source_url: `subculture-calendar://${e.id}`,
    source_title: e.title,
    raw: e,
  }))
}

export function buildSubcultureCalendarDraft(candidate) {
  const e = candidate.raw
  const { venue, address } = splitPlace(e.place)

  // 다른 구조화 소스들과 마찬가지로 스키마로 한 번 검증해서, 형태가 어긋난 값이
  // 그대로 event_drafts에 들어가지 않게 한다.
  return EventExtractionSchema.parse({
    is_event: true,
    title: e.title,
    category: inferCategory(`${e.title} ${e.category ?? ''} ${e.place ?? ''}`),
    start_date: e.start,
    end_date: e.end || e.start,
    venue,
    venue_address: address,
    organizer: null,
    description: null,
    ticket_url: null,
    ticket_open_date: null,
    ticket_open_time: null,
    ticket_open_note: null,
    admission_fee: null,
    website: e.url ? `https://comicw.co.kr${e.url}` : null,
    tags: [e.category, e.region].filter(Boolean),
    // 일정표에 우리 범위를 벗어나는 행사도 섞여 있어 자동 승인하지 않는다.
    confidence: 'low',
  })
}
