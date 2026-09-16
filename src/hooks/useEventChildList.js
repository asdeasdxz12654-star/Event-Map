import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fetchAllRows } from '../lib/fetchAllRows'

// event_booths(참가 부스) / event_performers(출연진)처럼 "행사 하나에 딸린 목록"
// 테이블을 공통으로 초기 로드 + 실시간 구독한다. 두 테이블 모두 event_id로 묶이고
// sort_order로 정렬되며 반영 방식이 같아서, 훅을 하나로 합치고 테이블명·행 변환·
// 정렬 기준만 인자로 받는다.
//
//   table    : Supabase 테이블명
//   eventId  : 대상 행사 id (없으면 빈 목록)
//   mapRow   : DB 행(snake_case) -> 컴포넌트용 객체(camelCase) 변환
//   sortName : sort_order가 같을 때 2차 정렬에 쓸 문자열 접근자
export function useEventChildList({ table, eventId, mapRow, sortName }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) {
      setItems([])
      setLoading(false)
      return
    }

    const sortItems = list =>
      [...list].sort((a, b) => a.sortOrder - b.sortOrder || sortName(a).localeCompare(sortName(b)))

    let cancelled = false
    setLoading(true)

    // 1000행 상한을 넘겨 전부 받는다.
    //
    // 예전엔 단발 조회였다. PostgREST는 요청당 1000행까지만 주는데 **에러 없이 잘린다** —
    // 코믹월드처럼 동아리가 수백~수천인 행사에서 부스 목록이 조용히 끊기고, 화면은
    // 아무 문제 없다는 얼굴로 잘린 목록을 그렸다. 없는 부스를 아무리 찾아도 안 나오는데
    // 왜 없는지 알 방법도 없었다.
    fetchAllRows(() => supabase.from(table).select('*'), {
      build: q => q.eq('event_id', eventId),
    })
      .then(rows => {
        if (cancelled) return
        setItems(sortItems(rows.map(mapRow)))
        setLoading(false)
      })
      .catch(() => {
        // 마이그레이션 전이라 테이블이 없는 경우가 있다(예전 단발 조회도 조용히 넘어갔다).
        // 여기서 화면을 오류로 덮으면 나머지 탭까지 같이 못 쓰게 된다.
        if (!cancelled) setLoading(false)
      })

    const channel = supabase
      .channel(`${table}-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `event_id=eq.${eventId}` },
        payload => {
          setItems(current => {
            if (payload.eventType === 'DELETE') {
              return current.filter(item => item.id !== payload.old.id)
            }
            const updated = mapRow(payload.new)
            return sortItems([...current.filter(item => item.id !== updated.id), updated])
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // mapRow/sortName은 모듈 스코프의 고정 함수라 의존성에 넣지 않아도 안전하다
    // (매 렌더 새 함수가 들어오면 구독이 계속 끊겼다 붙었다 하므로 오히려 위험).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, eventId])

  return { items, loading }
}
