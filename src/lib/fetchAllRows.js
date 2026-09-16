// PostgREST의 1000행 상한을 넘겨 전부 받아온다.
//
// 왜 필요한가
//   Supabase(PostgREST)는 요청당 기본 1000행까지만 준다. 넘으면 **에러 없이 잘린다** —
//   호출부는 성공한 줄 알고 잘린 목록을 그린다. 화면에는 "부스 1000개"라고 뜨고,
//   1001번째 부스는 찾을 수 없는데 왜 없는지도 알 수 없다.
//
//   useEvents는 이 루프를 갖고 있었지만 이펙트 안에 지역 함수로 박혀 있어서 다른 데서
//   쓸 수 없었다. 그래서 useEventChildList(부스·굿즈·무대·코스어를 전부 읽는 공용 훅)는
//   페이징 없이 단발 조회를 했다 — 코믹월드급 행사(수백~수천 동아리)에서 조용히 잘린다.
//
// 정렬을 고정해야 하는 이유
//   페이지 사이에 순서가 흔들리면 같은 행이 두 번 오거나 아예 빠진다. 정렬 키가 겹치는
//   행들(같은 sort_order, 같은 날짜)의 순서를 DB가 매번 다르게 정할 수 있기 때문이다.
//   그래서 호출부가 준 정렬 뒤에 항상 기본키를 덧붙여 순서를 유일하게 만든다.
export const PAGE_SIZE = 1000

// build: (query) => query — .eq()·.gte() 같은 조건을 얹어 돌려주는 함수.
//        range/order는 여기서 붙이므로 build 안에서 붙이지 말 것.
// order: [{ column, ascending }] — 마지막에 tiebreaker가 자동으로 붙는다.
export async function fetchAllRows(baseQuery, { build, order = [], tiebreaker = 'id' } = {}) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = build ? build(baseQuery()) : baseQuery()
    for (const { column, ascending = true } of order) {
      q = q.order(column, { ascending })
    }
    q = q.order(tiebreaker, { ascending: true }).range(from, from + PAGE_SIZE - 1)

    const { data, error } = await q
    if (error) throw error
    rows.push(...data)
    // 요청한 개수보다 적게 왔으면 마지막 페이지다.
    if (data.length < PAGE_SIZE) return rows
  }
}
