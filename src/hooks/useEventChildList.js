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
// 이 테이블이 아직 DB에 없다는 뜻인가.
//
// 마이그레이션 전에는 조회가 실패하는 게 정상이다. 그건 고장이 아니라 "아직"이라서,
// 화면에 오류를 띄우면 안 된다. 반대로 네트워크가 끊겨서 못 받은 것은 고장이고,
// 그걸 조용히 넘기면 "공식이 아직 발표 안 함"으로 읽힌다 — 정반대의 뜻이다.
//
//   42P01   undefined_table (PostgreSQL)
//   PGRST205 PostgREST가 스키마 캐시에서 테이블을 못 찾음
function isMissingTable(error) {
  const code = error?.code ?? ''
  if (code === '42P01' || code === 'PGRST205') return true
  return /does not exist|Could not find the table/i.test(error?.message ?? '')
}

export function useEventChildList({ table, eventId, mapRow, sortName }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 다시 시도 버튼이 값을 바꿔서 아래 이펙트를 다시 돌린다.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!eventId) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    const sortItems = list =>
      [...list].sort((a, b) => a.sortOrder - b.sortOrder || sortName(a).localeCompare(sortName(b)))

    let cancelled = false
    setLoading(true)
    setError(null)

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
      .catch(fetchError => {
        if (cancelled) return
        // 화면 전체를 오류로 덮지는 않는다 — 부스를 못 받았다고 무대·굿즈 탭까지
        // 못 쓰게 할 이유는 없다. 오류는 그 탭 안에만 그린다(DisclosureNote).
        //
        // 예전엔 여기서 아무것도 안 하고 넘어갔다. 그러면 호출부는 빈 목록을 받고,
        // 화면은 "아직 등록된 부스 정보가 없습니다"를 그린다 — 못 불러온 것이
        // "공식이 아직 발표 안 함"으로 둔갑한다. 방문자는 부스가 없는 줄 알고 나간다.
        setError(isMissingTable(fetchError) ? null : fetchError)
        setLoading(false)
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
  }, [table, eventId, attempt])

  return { items, loading, error, retry: () => setAttempt(n => n + 1) }
}
