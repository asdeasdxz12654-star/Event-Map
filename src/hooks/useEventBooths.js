import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// DB 행(snake_case) -> 컴포넌트가 쓰는 부스 객체(camelCase)로 변환
function mapBooth(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    boothNo: row.booth_no,
    goods: row.goods,
    sortOrder: row.sort_order ?? 0,
  }
}

function sortBooths(list) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

// 특정 행사의 참가 업체·부스 목록을 초기 로드 + 실시간 구독한다.
export function useEventBooths(eventId) {
  const [booths, setBooths] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) {
      setBooths([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('event_booths')
      .select('*')
      .eq('event_id', eventId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setBooths(sortBooths(data.map(mapBooth)))
        setLoading(false)
      })

    const channel = supabase
      .channel(`event-booths-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_booths', filter: `event_id=eq.${eventId}` }, payload => {
        setBooths(current => {
          if (payload.eventType === 'DELETE') {
            return current.filter(b => b.id !== payload.old.id)
          }
          const updated = mapBooth(payload.new)
          const withoutOld = current.filter(b => b.id !== updated.id)
          return sortBooths([...withoutOld, updated])
        })
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [eventId])

  return { booths, loading }
}
