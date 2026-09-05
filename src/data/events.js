// 이벤트 데이터는 Supabase 'events' 테이블에서 가져온다. (src/hooks/useEvents.js, src/supabase.js)
export const CATEGORIES = {
  GAME: '게임전시',
  COSPLAY: '코스프레',
  CONCERT: '게임음악',
}

export const STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  ENDED: 'ended',
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

// 행사의 시작월~종료월 범위에 target month(1-12)가 포함되면 true.
// 연도 경계를 넘는 행사(예: 12월 시작 → 1월 종료)는 단순 비교라 제외되지만
// 현재 데이터셋에는 해당 케이스가 없어 실용상 충분하다.
export function filterByMonth(eventList, month) {
  if (!month) return eventList
  return eventList.filter(e => {
    const startM = parseInt(e.startDate?.split('-')[1], 10)
    const endM   = parseInt(e.endDate?.split('-')[1],   10)
    if (!startM) return false
    return startM <= month && month <= (endM || startM)
  })
}

// eventList에서 행사가 존재하는 월(1-12) 목록을 오름차순으로 반환한다.
export function getActiveMonths(eventList) {
  const months = new Set()
  for (const e of eventList) {
    const startM = parseInt(e.startDate?.split('-')[1], 10)
    const endM   = parseInt(e.endDate?.split('-')[1],   10)
    if (!startM) continue
    for (let m = startM; m <= (endM || startM); m++) months.add(m)
  }
  return [...months].sort((a, b) => a - b)
}
