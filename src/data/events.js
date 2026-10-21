// 이벤트 데이터는 Supabase 'events' 테이블에서 가져온다. (src/hooks/useEvents.js, src/supabase.js)
import { horizonFrom } from '../../shared/event-horizon.mjs'
import { normalizedTitle } from '../../shared/duplicate-match.mjs'

export const CATEGORIES = {
  GAME: '게임전시',
  COSPLAY: '코스프레',
  CONCERT: '게임음악',
  // 일러스트레이션페어·문구전·캐릭터페어처럼 그림/굿즈 중심 행사.
  // 위 셋 어디에도 안 맞는데 같은 관객층이 찾는 행사라 따로 뒀다.
  ILLUST: '일러스트',
}

export const STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  ENDED: 'ended',
}

// 카테고리별 이모지·색상 — 예전엔 CategoryBadge/EventCard/EventDetailPage/CalendarPage가
// 각자 같은 매핑을 따로 들고 있어서, 카테고리를 추가하거나 색을 바꾸면 네 군데를 모두
// 고쳐야 했다(=빠뜨리기 쉬움). 여기 하나만 고치면 전부 반영되게 모아둔다.
const CATEGORY_META = {
  [CATEGORIES.GAME]:    { emoji: '🎮', dotClass: 'bg-violet-400' },
  [CATEGORIES.COSPLAY]: { emoji: '✨', dotClass: 'bg-pink-400' },
  [CATEGORIES.CONCERT]: { emoji: '🎵', dotClass: 'bg-amber-400' },
  [CATEGORIES.ILLUST]:  { emoji: '🎨', dotClass: 'bg-sky-400' },
}

const UNKNOWN_CATEGORY_META = {
  emoji: '🎪',
  dotClass: 'bg-zinc-400',
}

// DB에 check 제약이 걸려 있어 실제로는 네 카테고리뿐이지만, 크롤러가 새 값을 넣는
// 상황 등을 대비해 기본값을 준다.
export function categoryMeta(category) {
  return CATEGORY_META[category] ?? UNKNOWN_CATEGORY_META
}

// "2026-12-04" -> 로컬 시간대의 그 날 자정.
// new Date("2026-12-04")는 UTC 자정으로 읽혀서, UTC보다 뒤진 지역에서 보면 하루 앞당겨
// 표시된다. 날짜만 있는 값(행사 시작·종료일)은 전부 이 함수로 파싱한다.
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getEventStatus(event) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseLocalDate(event.startDate)
  const end = parseLocalDate(event.endDate)
  end.setHours(23, 59, 59, 999)

  if (today > end) return STATUS.ENDED
  if (today >= start) return STATUS.ONGOING
  return STATUS.UPCOMING
}

// 시작일까지 남은 일수 (진행중이면 0, 종료면 음수)
export function getDaysUntil(event) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseLocalDate(event.startDate) - today) / 86400000)
}

export function filterByStatus(eventList, status) {
  return eventList.filter(e => getEventStatus(e) === status)
}

// 예정 탭이 한눈에 담는 기간.
//
// 목록은 "지난 1년 ~ 앞으로 1년"을 통째로 받아온다(useEvents.js — 1월 1일에 작년 행사가
// 한꺼번에 사라지는 걸 막기 위해서다). 그 범위를 예정 탭에 그대로 쏟으면 이번 달 행사와
// 내년 행사가 같은 목록에 섞인다.
//
// 선 자체는 shared/event-horizon.mjs에 있다(올해 끝 + 연말 하한). 크롤러도 같은 선을
// 쓴다 — 자동 승인된 행사가 이 선 밖이면 아무도 못 보는 자리에 올리는 셈이라, 두 값은
// 같아야 한다.

// 오늘 기준 지평선의 'YYYY-MM-DD'. 이 날짜까지가 "가까운 것"이다(당일 포함).
//
// 여기서 "오늘"은 브라우저 지역 시간이다. 크롤러는 KST로 오늘을 구해서 같은 함수에
// 넣는다(crawler/src/date-kst.mjs) — 시간대는 부르는 쪽이 정하고, 날짜 계산은 공용이다.
export function upcomingHorizon(today = new Date()) {
  return horizonFrom(localYmd(today))
}

// Date -> 'YYYY-MM-DD' (지역 시간 기준).
// toISOString()을 쓰면 UTC+ 지역에서 하루 앞당겨진다.
function localYmd(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 목록을 "지평선 안"과 "그 뒤"로 가른다.
//
// far를 버리지 않고 돌려주는 게 핵심이다. 지스타 2027처럼 날짜가 공식으로 확정된 행사를
// 목록에서 영구히 지우면 찾아갈 길이 사라진다 — 숨기는 것과 없애는 것은 다르다.
// 호출부(HomePage)는 far를 접힌 줄 뒤에 두고, 사용자가 달을 고르거나 검색을 하면
// 가르기 자체를 건너뛴다.
export function splitByHorizon(eventList, horizon = upcomingHorizon()) {
  const near = []
  const far = []
  for (const event of eventList) {
    if (event.startDate && event.startDate > horizon) far.push(event)
    else near.push(event)
  }
  return { near, far }
}

export function filterByCategory(eventList, category) {
  if (!category) return eventList
  return eventList.filter(e => e.category === category)
}

// 한글·영문으로 둘 다 불리는 행사명. 정규화한 형태(띄어쓰기·문장부호 없음, 소문자)로 적는다.
//
// 태그에 두 표기가 다 들어 있으면 이게 없어도 찾아지지만, 뉴스로 들어온 행사의 태그는
// LLM이 단 것이라(참가사 이름 등) 그런 보장이 없다. "지스타"로 검색했는데 제목이
// "G-STAR 2026"인 행사가 안 나오던 게 그 경우다.
//
// 여기 넣는 건 실제로 두 표기가 다 쓰이는 고정 행사뿐이다. 약칭(BIC·AGF)처럼 다른
// 단어 안에 우연히 들어갈 수 있는 짧은 말은 넣지 않는다.
const SEARCH_ALIASES = [
  ['지스타', 'gstar'],
  ['플레이엑스포', 'playx4'],
  ['원더리벳', 'wonderlivet'],
  ['일러스타페스', 'illustarfes'],
  ['코믹월드', 'comicworld'],
  ['호요랜드', 'hoyoland'],
]

// 검색어 한 단어 -> 같이 찾아볼 표기들(자기 자신 포함).
function searchVariants(term) {
  const variants = [term]
  for (const group of SEARCH_ALIASES) {
    const hit = group.find(name => term.includes(name))
    if (!hit) continue
    for (const other of group) {
      if (other !== hit) variants.push(term.replace(hit, other))
    }
  }
  return variants
}

// 검색.
//
// 띄어쓰기·문장부호를 떼고 비교한다(중복 판정과 같은 규칙 — shared/duplicate-match.mjs).
// 예전엔 글자 그대로 비교해서 "호요랜드2026"으로 "호요랜드 2026"이 안 나왔다. 행사명은
// 쓰는 사람마다 띄어쓰기가 다르다.
//
// 검색어를 공백으로 나눠 **모든 단어**가 어딘가(제목·장소·주최·태그)에 있어야 한다.
// 통째로 붙여서 비교하면 "지스타 부산"이 "지스타2026"(제목)과 "부산"(태그)에 흩어져
// 있어 안 나온다.
export function filterBySearch(eventList, query) {
  if (!query || !query.trim()) return eventList
  const terms = query.trim().split(/\s+/).map(normalizedTitle).filter(Boolean)
  // 문장부호만 친 경우("·")는 거를 근거가 없으므로 전부 보여준다.
  if (terms.length === 0) return eventList
  const termVariants = terms.map(searchVariants)
  // 통째로 붙인 검색어도 한 단어로 본다. 나눠서만 보면 "Comic World"가 "comic"과
  // "world"가 되어 별칭(comicworld)에 걸리지 않는다.
  const wholeVariants = searchVariants(terms.join(''))

  return eventList.filter(e => {
    const fields = [e.title, e.venue, e.organizer, ...(e.tags ?? [])]
      .filter(Boolean)
      .map(normalizedTitle)
    const has = variants => variants.some(v => fields.some(f => f.includes(v)))
    return termVariants.every(has) || has(wholeVariants)
  })
}

export function sortByNewest(list) {
  return [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

// 월 필터는 'YYYY-MM' 문자열을 쓴다. 예전엔 월 숫자(1-12)만 비교해서
//   1) 2026년 11월과 2027년 11월 행사가 같은 "11월"로 섞이고
//   2) 연도를 넘기는 행사(12월 시작 → 1월 종료)가 아예 걸러지지 않는
// 문제가 있었다. 연-월을 통째로 비교하면 둘 다 자연스럽게 해결된다.
function nextYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// 행사가 걸쳐 있는 모든 'YYYY-MM'을 반환 (시작월~종료월, 연도 경계 포함).
function yearMonthsOf(event) {
  const start = event.startDate?.slice(0, 7)
  if (!start) return []
  const end = (event.endDate ?? event.startDate).slice(0, 7)
  const result = []
  // 데이터 오류(종료일이 시작일보다 한참 뒤)로 무한 루프에 빠지지 않게 상한을 둔다.
  for (let ym = start, i = 0; ym <= end && i < 24; ym = nextYearMonth(ym), i++) {
    result.push(ym)
  }
  return result
}

export function filterByMonth(eventList, yearMonth) {
  if (!yearMonth) return eventList
  return eventList.filter(e => yearMonthsOf(e).includes(yearMonth))
}

// eventList에서 행사가 존재하는 'YYYY-MM' 목록을 오름차순으로 반환한다.
export function getActiveMonths(eventList) {
  const months = new Set()
  for (const e of eventList) {
    for (const ym of yearMonthsOf(e)) months.add(ym)
  }
  return [...months].sort()
}
