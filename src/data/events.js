// 이벤트 데이터는 Firestore 'EventMap' 컬렉션에서 가져온다. (src/hooks/useEvents.js)
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

export function getEventStatus(event) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  end.setHours(23, 59, 59, 999)

  if (today > end) return STATUS.ENDED
  if (today >= start) return STATUS.ONGOING
  return STATUS.UPCOMING
}

export function filterByStatus(eventList, status) {
  return eventList.filter(e => getEventStatus(e) === status)
}

export function filterByCategory(eventList, category) {
  if (!category) return eventList
  return eventList.filter(e => e.category === category)
}
