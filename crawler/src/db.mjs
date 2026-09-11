// Supabase(PostgREST) 조회 유틸.
//
// PostgREST는 요청당 반환 행 수에 상한이 있다(Supabase 기본 1000행). 그냥 select하면
// 행사가 1000건을 넘는 순간 **에러도 없이** 앞쪽 1000건만 돌아오고, 그 뒤 행사는
// 검증·보정 스크립트가 아예 본 적도 없는 상태가 된다. notifier는 이 문제를 이미
// range() 페이징으로 처리하고 있었는데, 크롤러 쪽 스크립트들은 그대로였다.
//
// 사용법 — 쿼리를 "만드는 함수"를 넘긴다. 페이지마다 새 쿼리가 필요해서다
// (supabase-js 쿼리 빌더는 한 번 await하면 재사용할 수 없다):
//   const events = await fetchAllRows(() =>
//     supabase.from('events').select('id, title').is('poster_url', null)
//       .order('start_date').order('id'))
//
// 정렬은 반드시 "동점이 없는" 상태여야 한다. start_date만으로 정렬하면 같은 날짜 행끼리는
// 페이지마다 순서가 달라질 수 있고, 그러면 경계에 걸친 행이 두 번 나오거나 아예 빠진다.
// 그래서 호출부는 마지막에 .order('id')를 덧붙여 순서를 확정한다.
const PAGE_SIZE = 1000

export async function fetchAllRows(buildQuery, pageSize = PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}
