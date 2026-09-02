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
