// 이벤트 데이터는 Supabase 'events' 테이블에서 가져온다. (src/hooks/useEvents.js, src/supabase.js)
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
  [CATEGORIES.GAME]:    { emoji: '🎮', badgeClass: 'bg-violet-500/20 text-violet-300', dotClass: 'bg-violet-400' },
  [CATEGORIES.COSPLAY]: { emoji: '✨', badgeClass: 'bg-pink-500/20 text-pink-300',     dotClass: 'bg-pink-400' },
  [CATEGORIES.CONCERT]: { emoji: '🎵', badgeClass: 'bg-amber-500/20 text-amber-300',   dotClass: 'bg-amber-400' },
  [CATEGORIES.ILLUST]:  { emoji: '🎨', badgeClass: 'bg-sky-500/20 text-sky-300',       dotClass: 'bg-sky-400' },
}

const UNKNOWN_CATEGORY_META = {
  emoji: '🎪',
  badgeClass: 'bg-zinc-700/50 text-zinc-300',
  dotClass: 'bg-zinc-400',
}

// DB에 check 제약이 걸려 있어 실제로는 네 카테고리뿐이지만, 크롤러가 새 값을 넣는
// 상황 등을 대비해 기본값을 준다.
export function categoryMeta(category) {
  return CATEGORY_META[category] ?? UNKNOWN_CATEGORY_META
}

function parseLocalDate(dateStr) {
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

export function filterByCategory(eventList, category) {
  if (!category) return eventList
  return eventList.filter(e => e.category === category)
}

export function filterBySearch(eventList, query) {
  if (!query || !query.trim()) return eventList
  const q = query.trim().toLowerCase()
  return eventList.filter(e =>
    e.title?.toLowerCase().includes(q) ||
    e.venue?.toLowerCase().includes(q) ||
    e.organizer?.toLowerCase().includes(q) ||
    e.tags?.some(t => t.toLowerCase().includes(q))
  )
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
