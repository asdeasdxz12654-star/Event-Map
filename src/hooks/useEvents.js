import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { httpUrl } from '../lib/url'
import { fetchAllRows } from '../lib/fetchAllRows'

// DB 행(snake_case) -> 컴포넌트가 쓰는 이벤트 객체(camelCase)로 변환
// (useEvent.js가 행사 한 건을 직접 받아올 때도 같은 변환을 써야 해서 export한다)
//
// 링크·이미지로 나가는 주소는 여기서 httpUrl()로 한 번 거른다. 화면 곳곳에서 쓰이는 값이
// 전부 이 함수를 지나가므로, 컴포넌트마다 검사를 흩뿌리지 않고 이 한 곳만 지키면 된다.
// http(s)가 아니면 null — 호출부는 이미 "값이 없을 때"를 처리하고 있어서(포스터 없으면
// 대체 화면, ticketUrl 없으면 버튼 숨김) 별도 분기가 필요 없다.
export function mapEvent(row) {
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
    posterUrl: httpUrl(row.poster_url),
    ticketUrl: httpUrl(row.ticket_url),
    ticketOpenDate: row.ticket_open_date,
    ticketOpenTime: row.ticket_open_time,
    ticketOpenNote: row.ticket_open_note,
    crowdLevel: row.crowd_level,
    floorPlanUrl: httpUrl(row.floor_plan_url),
    floorPlanNote: row.floor_plan_note,
    seoulPlaceName: row.seoul_place_name,
    boothInfoNote: row.booth_info_note,
    stageInfoNote: row.stage_info_note,
    goodsInfoNote: row.goods_info_note,
    cosplayInfoNote: row.cosplay_info_note,
    admissionFee: row.admission_fee,
    website: httpUrl(row.website),
    trustScore: row.trust_score,
    pastEvents: row.past_events ?? [],
    tags: row.tags ?? [],
    ticketStatus: row.ticket_status ?? 'unknown',
    createdAt: row.created_at ?? null,
    // 관리자가 직접 수정해서 크롤러가 이 행을 건너뛰는지. 방문자 화면은 안 쓰지만,
    // 어드민이 이 값을 보려면 mapEvent를 지나야 한다(useEvent가 이 변환만 쓴다).
    adminEditedAt: row.admin_edited_at ?? null,
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
  // 다시 시도 버튼이 값을 바꿔서 아래 이펙트를 다시 돌린다. 오프라인에서 새로고침을
  // 시키면 캐시에서 앱을 처음부터 다시 띄우게 되는데, 그건 이미 떠 있는 화면을 버리는 일이다.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    // 목록에는 "지난 1년 ~ 앞으로 1년"을 노출한다.
    //
    // 예전엔 "올해 + 앞으로 90일"이었다. 연말 문제(12월에 들어오면 코앞인 1월 행사가
    // 안 보이는 것)는 그 90일이 막아줬지만, 더 큰 문제가 남아 있었다 —
    // **1월 1일이 되면 작년 행사가 한꺼번에 사라진다.**
    //
    //   2027-01-01 → 조회 범위가 2027-01-01부터
    //              → 2026년에 열린 행사 전부가 목록·달력·북마크에서 빠진다
    //
    // 상세 주소로는 열리지만 찾아갈 길이 없어지고, 북마크해 둔 행사까지 북마크 화면에서
    // 빠진다(BookmarksPage가 이 목록과 교집합을 낸다). 매년 1월 1일에 사이트가 기억을
    // 통째로 잃는 셈이다.
    //
    // 범위를 오늘 기준 앞뒤 1년으로 바꾼다. "예정 탭이 부풀어 보인다"는 원래 걱정은
    // 상태 필터(예정/진행중/종료)가 이미 해결하고 있다 — 기본값도 "예정"이라
    // 처음 들어온 사람에게는 달라지는 게 없다.
    const DAY = 86400000
    const ymd = d => new Date(d).toISOString().slice(0, 10)
    const now = new Date()
    const rangeStart = ymd(now.getTime() - 365 * DAY)
    const rangeEnd = ymd(now.getTime() + 365 * DAY)

    // 1000행 상한을 넘겨 전부 받는다 — 페이징 루프는 src/lib/fetchAllRows.js에 있다
    // (부스 목록도 같은 함정을 밟고 있어서 공용으로 뺐다).
    fetchAllRows(() => supabase.from('events').select('*'), {
      build: q => q.gte('start_date', rangeStart).lte('start_date', rangeEnd),
      order: [{ column: 'start_date', ascending: true }],
    })
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
  }, [attempt])

  return { events, loading, error, refetch: () => setAttempt(n => n + 1) }
}
