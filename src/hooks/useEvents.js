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

const PAGE_SIZE = 1000 // PostgREST 기본 상한

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

    // 목록에는 "올해 행사 + 앞으로 90일"만 노출한다.
    //
    // 내년 행사까지 전부 보이면 지금 갈 수 있는 행사와 1년 뒤 행사가 같은 목록에 섞여서
    // "예정" 탭이 실제보다 부풀려 보인다. 그렇다고 올해(12/31)로 딱 자르면 연말에
    // 문제가 생긴다 — 12월에 들어오면 코앞인 1월 행사가 목록에서 통째로 사라진다.
    // 그래서 연말에는 다음 해로 90일만 창을 넓힌다.
    const now = new Date()
    const rangeStart = `${now.getFullYear()}-01-01`
    const yearEnd = `${now.getFullYear()}-12-31`
    const in90Days = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10)
    const rangeEnd = in90Days > yearEnd ? in90Days : yearEnd

    // PostgREST는 요청당 기본 1000행까지만 준다 — 에러도 없이 잘려 나가므로,
    // 끝 페이지(요청한 개수보다 적게 온 페이지)가 나올 때까지 range로 이어 받는다.
    async function fetchAllEvents() {
      const rows = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .gte('start_date', rangeStart)
          .lte('start_date', rangeEnd)
          // 페이지 사이에 순서가 흔들리면 행이 누락/중복되므로 정렬을 고정한다.
          .order('start_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (fetchError) throw fetchError
        rows.push(...data)
        if (data.length < PAGE_SIZE) return rows
      }
    }

    fetchAllEvents()
      .then(rows => {
        if (cancelled) return
        setEvents(sortByStartDate(rows.map(mapEvent)))
        setLoading(false)
      })
      .catch(fetchError => {
        if (cancelled) return
        setError(fetchError)
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
