import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { mapEvent } from './useEvents'

// 행사 "한 건"만 id로 받아온다.
//
// 상세 화면은 원래 useEvents()로 목록 전체를 받아 그중에서 find로 골라 썼는데, 그
// 목록은 "올해 + 앞으로 90일"만 담는다(useEvents.js 참고). 그래서 그 범위 밖 행사는
// 링크를 직접 열거나 북마크·검색결과·공유 링크로 들어오면 데이터가 아예 없어서
// "행사 정보를 찾을 수 없습니다"가 떴다 — 삭제된 행사와 구분이 안 됐다.
// (실제로 링크 미리보기용 Cloudflare 함수 functions/events/[id].js는 id로 바로 조회해서
//  제목·포스터를 잘 보여주는데, 정작 그 링크를 눌러 들어오면 없는 행사 취급이었다.)
//
// 덤으로 상세 화면 하나 때문에 행사 목록을 통째로 받아오던 것도 없어진다.
export function useEvent(id) {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) {
      setEvent(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setEvent(null)

    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError)
        else setEvent(data ? mapEvent(data) : null)
        setLoading(false)
      })

    // 관리자가 수정하거나 크롤러가 포스터를 채우면 새로고침 없이 반영되게 한다
    // (목록과 달리 이 행 하나만 구독한다).
    const channel = supabase
      .channel(`event-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${id}` }, payload => {
        if (payload.eventType === 'DELETE') setEvent(null)
        else setEvent(mapEvent(payload.new))
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [id])

  return { event, loading, error }
}
