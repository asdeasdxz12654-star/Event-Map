import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { adminApi } from '../lib/adminApi'
import { fetchAllRows } from '../lib/fetchAllRows'

// 대시보드가 쓰는 집계.
//
// 왜 이게 필요한가
//   지금까지 데이터에 생긴 문제는 전부 사람이 우연히 발견했다 — 목록에서 중복을 눈으로
//   보거나, 크롤러 로그를 뒤지거나, SQL을 직접 두드려서. 화면 어디에도 "지금 무엇이
//   비어 있는가"를 말해주는 자리가 없었기 때문이다. 여기가 그 자리다.
//
// 새 테이블을 만들지 않는다
//   전부 이미 있는 행에서 세어낸다. 집계를 따로 저장하면 그 집계가 또 틀리기 시작하고,
//   틀렸는지 확인할 방법이 없다. 매번 세는 쪽이 느려도 항상 맞다.
//
// count만 받는다
//   .select('*', { count: 'exact', head: true })는 행을 안 받고 개수만 받는다.
//   중복 판정만 예외다 — 제목을 서로 비교해야 해서 목록이 필요하다.

// 오늘을 'YYYY-MM-DD'로. start_date·end_date가 시간 없는 date 컬럼이라 문자열로 비교한다.
// 앱 전체가 로컬 시간을 기준으로 상태를 판정하므로(src/data/events.js getEventStatus)
// 여기서도 같은 기준을 쓴다 — 어긋나면 목록과 대시보드의 "진행중" 개수가 달라진다.
function today() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// PostgREST 조건 하나를 세는 최소 단위.
//
// 실패하면 0이 아니라 null을 돌려준다. 이 화면의 일이 "무엇이 비어 있는지 보여주는 것"인데,
// 못 센 것을 0으로 적으면 화면이 "빈 자리 없음"이라고 거짓말을 한다 — 정확히 이 화면이
// 없애려는 종류의 실패다. null은 화면에서 숫자가 아니라 "—"로 나온다.
// (테이블이 아직 없는 경우도 여기로 온다. 마이그레이션 전이라는 뜻이니 0이 아니다.)
async function countWhere(table, build) {
  try {
    const { count, error } = await build(supabase.from(table).select('*', { count: 'exact', head: true }))
    // count가 null이면 서버가 개수를 안 준 것이다(Content-Range 없음). 0으로 읽지 않는다 —
    // "0건"과 "못 셌다"는 화면에서 정반대의 뜻이다.
    return error ? null : count ?? null
  } catch {
    return null
  }
}

// SQL의 public.normalized_title()을 그대로 옮긴 것.
//
// 왜 JS로 다시 쓰나: 중복 판정은 "제목끼리 비교"라 PostgREST 필터로 표현할 수 없다.
// DB 함수를 부르려면 RPC를 새로 만들어야 하는데, 행사 수가 수백 단위라 목록을 받아
// 여기서 묶는 편이 단순하다. 규칙이 갈라지지 않게 원본 SQL을 함께 적어둔다.
//   lower(regexp_replace(regexp_replace(t, '[[:space:]]+', ''), '[[:punct:]·∙‧・]+', ''))
function normalizedTitle(t) {
  return (t ?? '')
    .replace(/\s+/g, '')
    .replace(/[!-/:-@[-`{-~·∙‧・]+/g, '')
    .toLowerCase()
}

export function useAdminStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)

    load()
      .then(next => { if (!cancelled) { setStats(next); setError(null) } })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  useEffect(() => refresh(), [refresh])

  return { stats, loading, error, refresh }
}

async function load() {
  const now = today()

  const [
    total, upcoming, ongoing, ended,
    noPoster, noCoords, noFloorPlan, goodsNoImage, noDisclosure, locked,
    drafts, reports, watches, titles, jobRuns,
  ] = await Promise.all([
    countWhere('events', q => q),
    countWhere('events', q => q.gt('start_date', now)),
    countWhere('events', q => q.lte('start_date', now).gte('end_date', now)),
    countWhere('events', q => q.lt('end_date', now)),

    countWhere('events', q => q.is('poster_url', null)),
    countWhere('events', q => q.is('venue_lat', null)),
    // 배치도는 "주소도 없고 미공개 메모도 없는" 것만 빈 자리로 본다. 공식이 아직
    // 발표를 안 했으면 floor_plan_note에 "미공개"가 적혀 있고, 그건 채워진 상태다.
    countWhere('events', q => q.is('floor_plan_url', null).is('floor_plan_note', null).gte('end_date', now)),
    countWhere('event_booth_items', q => q.eq('kind', 'goods').is('image_url', null)),
    // 네 탭(부스·무대·굿즈·코스어)의 "공개 상태" 메모가 하나라도 비어 있는 예정 행사.
    //
    // 이게 왜 빈 자리인가: 메모가 비어 있고 데이터도 없으면 그 탭은 아예 안 생긴다.
    // 방문자는 "공식이 아직 발표를 안 한 것"과 "원래 그런 게 없는 행사"를 구분할 수 없다.
    // 그 둘을 갈라 적는 것이 DisclosureNote의 일인데, 적어주지 않으면 갈라줄 수가 없다.
    countWhere('events', q => q
      .gte('end_date', now)
      .or('booth_info_note.is.null,stage_info_note.is.null,goods_info_note.is.null,cosplay_info_note.is.null')),
    countWhere('events', q => q.not('admin_edited_at', 'is', null)),

    // 검수 대기는 Worker에서 온다. 여기가 실패하면 화면 전체를 오류로 세운다 —
    // "검수 대기 0건"은 밀린 일이 없다는 뜻이라, 못 물어본 것과 결코 같지 않다.
    adminApi.listDrafts('pending'),
    // 제보도 Worker에서 온다. 여기가 실패하면 화면 전체를 오류로 세운다 —
    // "제보 0건"은 밀린 일이 없다는 뜻이라, 못 물어본 것과 결코 같지 않다.
    adminApi.listReports('open'),
    // 감시 테이블은 없을 수 있다(마이그레이션 전). 그건 실패가 아니라 "아직"이다.
    supabase.from('source_watches').select('*')
      .then(({ data, error }) => (error ? [] : data))
      .catch(() => []),
    // 자동 작업 실행 기록. 못 읽으면 null이다 — 빈 배열로 넘기면 화면이 "모든 작업
    // 기록 없음"이라고 단정하는데, 실제로는 물어보지 못한 것이다. 이 화면이 없애려는
    // 바로 그 종류의 거짓말이라 여기서만 예외적으로 null을 통과시킨다.
    // (job_runs 마이그레이션 전이면 Worker가 500을 주므로 여기로 온다.)
    adminApi.listJobRuns().catch(() => null),
    // 중복 판정만 목록이 필요하다. 여기에도 1000행 상한이 걸리므로 페이징으로 받는다 —
    // 잘리면 "중복 없음"으로 보이는데, 그게 바로 이 화면이 막으려는 상황이다.
    fetchAllRows(() => supabase.from('events').select('id, title, start_date')).catch(() => []),
  ])

  // 바뀐 뒤 아직 확인하지 않은 것만 "새 것"이다 (SourceWatchPanel과 같은 규칙).
  const freshWatches = watches.filter(
    w => w.last_changed_at && (!w.acknowledged_at || w.acknowledged_at < w.last_changed_at)
  )
  const brokenWatches = watches.filter(w => w.last_error)

  return {
    events: { total, upcoming, ongoing, ended },
    gaps: { noPoster, noCoords, noFloorPlan, goodsNoImage, noDisclosure },
    locked,
    pendingDrafts: drafts.length,
    openReports: reports.length,
    freshWatches: freshWatches.length,
    brokenWatches: brokenWatches.length,
    duplicates: findDuplicates(titles),
    // 판정은 화면 쪽(jobHealth.js)에서 한다 — 기준 시각이 필요한 계산이라,
    // 데이터를 불러온 순간이 아니라 그리는 순간을 기준으로 삼는 게 맞다.
    jobRuns,
  }
}

// 제목(띄어쓰기·문장부호 제거)과 시작일이 같은 행사 묶음.
//
// promote_event_draft() 트리거가 승인 시점에 쓰는 것과 같은 규칙이다. 그런데 트리거를
// 거치지 않고 들어온 행(크롤러 직접 insert, 관리자 수동 추가)은 이 검사를 안 지난다.
// 그래서 화면에서 한 번 더 본다 — 실제로 호요랜드 2026이 그렇게 두 개가 됐다.
function findDuplicates(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = `${normalizedTitle(row.title)}|${row.start_date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.values()]
    .filter(group => group.length > 1)
    .map(group => ({ title: group[0].title, startDate: group[0].start_date, ids: group.map(r => r.id) }))
}
