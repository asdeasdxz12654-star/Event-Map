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

export function getEventStatus(event) {
  // 날짜 문자열(yyyy-MM-dd)을 로컬 자정으로 파싱해 타임존 오차를 방지한다.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [sy, sm, sd] = event.startDate.split('-').map(Number)
  const [ey, em, ed] = event.endDate.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed, 23, 59, 59, 999)

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
