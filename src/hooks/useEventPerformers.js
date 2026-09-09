import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// DB 행(snake_case) -> 컴포넌트가 쓰는 출연진 객체(camelCase)로 변환
function mapPerformer(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    artistName: row.artist_name,
    songs: row.songs,
    sortOrder: row.sort_order ?? 0,
  }
}

function sortPerformers(list) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.artistName.localeCompare(b.artistName))
}

// 특정 행사(게임음악 카테고리)의 출연진·세트리스트를 초기 로드 + 실시간 구독한다.
export function useEventPerformers(eventId) {
  const [performers, setPerformers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) {
      setPerformers([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('event_performers')
      .select('*')
      .eq('event_id', eventId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setPerformers(sortPerformers(data.map(mapPerformer)))
        setLoading(false)
      })

    const channel = supabase
      .channel(`event-performers-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_performers', filter: `event_id=eq.${eventId}` }, payload => {
        setPerformers(current => {
          if (payload.eventType === 'DELETE') {
            return current.filter(p => p.id !== payload.old.id)
          }
          const updated = mapPerformer(payload.new)
          const withoutOld = current.filter(p => p.id !== updated.id)
          return sortPerformers([...withoutOld, updated])
        })
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [eventId])

  return { performers, loading }
}
