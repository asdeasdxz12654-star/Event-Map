import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// DB 행(snake_case) -> 컴포넌트가 쓰는 이벤트 객체(camelCase)로 변환
function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    startDate: row.start_date,
    endDate: row.end_date,
    venue: row.venue,
    venueAddress: row.venue_address,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
    organizer: row.organizer,
    description: row.description,
    posterUrl: row.poster_url,
    ticketUrl: row.ticket_url,
    ticketOpenDate: row.ticket_open_date,
    ticketOpenTime: row.ticket_open_time,
    ticketOpenNote: row.ticket_open_note,
    crowdLevel: row.crowd_level,
    floorPlanUrl: row.floor_plan_url,
    seoulPlaceName: row.seoul_place_name,
    boothInfoNote: row.booth_info_note,
    stageInfoNote: row.stage_info_note,
    admissionFee: row.admission_fee,
    website: row.website,
    trustScore: row.trust_score,
    pastEvents: row.past_events ?? [],
    tags: row.tags ?? [],
    ticketStatus: row.ticket_status ?? 'unknown',
    createdAt: row.created_at ?? null,
  }
}

function sortByStartDate(list) {
  return [...list].sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
}

// Supabase 'events' 테이블을 초기 로드 + 실시간(Realtime) 구독한다.
export function useEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    // 예전엔 "올해 1/1~12/31"만 불러왔는데, 그러면 12월에 접속했을 때 바로 다음 달
    // (내년 1월) 행사가 통째로 안 보이고, 이미 등록된 내년 행사(지스타 2027 등)도
    // 영영 안 뜬다. 올해 초부터 내년 말까지로 넓힌다 — 지난 행사는 "종료" 탭에서
    // 필요하므로 하한은 올해 1/1 그대로 둔다.
    const year = new Date().getFullYear()
    const rangeStart = `${year}-01-01`
    const rangeEnd = `${year + 1}-12-31`

    supabase
      .from('events')
      .select('*')
      .gte('start_date', rangeStart)
      .lte('start_date', rangeEnd)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError)
        } else {
          setEvents(sortByStartDate(data.map(mapEvent)))
        }
        setLoading(false)
      })

    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        setEvents(current => {
          if (payload.eventType === 'DELETE') {
            return current.filter(e => e.id !== payload.old.id)
          }
          const updated = mapEvent(payload.new)
          // 초기 조회와 같은 범위만 반영한다 (범위 밖 행사가 실시간으로 끼어들지 않게).
          if (!updated.startDate || updated.startDate < rangeStart || updated.startDate > rangeEnd) {
            return current
          }
          const withoutOld = current.filter(e => e.id !== updated.id)
          return sortByStartDate([...withoutOld, updated])
        })
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  return { events, loading, error }
}
