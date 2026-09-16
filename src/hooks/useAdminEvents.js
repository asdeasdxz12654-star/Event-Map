import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fetchAllRows } from '../lib/fetchAllRows'
import { mapEvent } from './useEvents'

// 어드민 행사 목록.
//
// useEvents와 따로 두는 이유
//   useEvents는 "올해 + 앞으로 90일"만 가져온다. 방문자 목록에는 그게 맞지만 —
//   지난 행사가 섞이면 "예정" 탭이 부풀어 보인다 — 관리자는 지난 행사도 고쳐야 한다.
//   범위 조건 하나 차이지만, useEvents에 플래그를 다는 대신 훅을 나눈다.
//   방문자 화면의 범위 규칙은 그 자체로 하나의 결정이라 조건문으로 흐려놓고 싶지 않다.
//
// 하위 개수를 한 번에 받는다
//   목록에 "부스 8 · 굿즈 76"을 띄우려고 행사마다 네 번씩 세면 행사 141개에 564번이다.
//   PostgREST의 내장 집계(event_booths(count))를 쓰면 한 번의 조회로 끝난다.
const SELECT = [
  '*',
  'event_booths(count)',
  'event_booth_items(count)',
  'event_stage_slots(count)',
  'event_cosplayers(count)',
].join(',')

// 내장 집계는 [{ count: n }] 모양으로 온다. 관계가 비었으면 빈 배열이다.
function countOf(embedded) {
  return Array.isArray(embedded) ? (embedded[0]?.count ?? 0) : 0
}

function mapAdminEvent(row) {
  return {
    ...mapEvent(row),
    counts: {
      booths: countOf(row.event_booths),
      items: countOf(row.event_booth_items),
      slots: countOf(row.event_stage_slots),
      cosplayers: countOf(row.event_cosplayers),
    },
  }
}

export function useAdminEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)

    fetchAllRows(() => supabase.from('events').select(SELECT), {
      order: [{ column: 'start_date', ascending: false }],
    })
      .then(rows => {
        if (cancelled) return
        setEvents(rows.map(mapAdminEvent))
        setError(null)
      })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  useEffect(() => refresh(), [refresh])

  return { events, loading, error, refresh }
}
