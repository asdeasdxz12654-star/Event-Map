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
    admissionFee: row.admission_fee,
    website: row.website,
    trustScore: row.trust_score,
    pastEvents: row.past_events ?? [],
    tags: row.tags ?? [],
    ticketStatus: row.ticket_status ?? 'unknown',
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

    supabase
      .from('events')
      .select('*')
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
