import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, fetchAllRows } from './fetchAllRows'

// PostgREST의 1000행 상한 넘기기.
//
// 이게 틀리면 목록이 조용히 잘린다 — 에러도 안 나고 화면은 아무 문제 없다는 얼굴을 한다.
// 실제로 부스 목록이 그 상태였고, 대시보드의 중복 판정도 같은 함정을 밟을 뻔했다.
// 잘리는 실패는 눈으로 못 잡으므로 여기서 잡는다.

// PostgREST 흉내: .range(from, to)로 잘라 주고, 요청 횟수를 센다.
function fakeTable(total) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  const state = { calls: 0, ranges: [], orders: [] }
  const q = {
    eq: () => q,
    gte: () => q,
    lte: () => q,
    order: (col, opt) => { state.orders.push(`${col}:${opt?.ascending ?? true}`); return q },
    range: (from, to) => { state._from = from; state._to = to; return q },
    then: (resolve) => {
      state.calls += 1
      state.ranges.push([state._from, state._to])
      return Promise.resolve({ data: all.slice(state._from, state._to + 1), error: null }).then(resolve)
    },
  }
  return { q, state }
}

describe('fetchAllRows', () => {
  it.each([
    ['빈 목록', 0, 1],
    ['한 페이지 미만', 5, 1],
    ['딱 한 페이지', PAGE_SIZE, 2],       // 꽉 찼으면 다음 페이지를 한 번 더 확인해야 한다
    ['한 페이지 + 1행', PAGE_SIZE + 1, 2],
    ['세 페이지', 2350, 3],
  ])('%s: %i행을 전부 받는다 (요청 %i회)', async (_name, total, expectedCalls) => {
    const { q, state } = fakeTable(total)
    const rows = await fetchAllRows(() => q)
    expect(rows).toHaveLength(total)
    expect(state.calls).toBe(expectedCalls)
  })

  it('페이지마다 range가 이어진다', async () => {
    const { q, state } = fakeTable(2350)
    await fetchAllRows(() => q)
    expect(state.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('정렬 뒤에 기본키를 덧붙인다', async () => {
    // 정렬 키가 겹치는 행들의 순서를 DB가 매번 다르게 정하면 페이지 사이에서
    // 같은 행이 두 번 오거나 아예 빠진다.
    const { q, state } = fakeTable(5)
    await fetchAllRows(() => q, { order: [{ column: 'start_date', ascending: false }] })
    expect(state.orders).toEqual(['start_date:false', 'id:true'])
  })

  it('정렬을 안 줘도 기본키 정렬은 붙는다', async () => {
    const { q, state } = fakeTable(5)
    await fetchAllRows(() => q)
    expect(state.orders).toEqual(['id:true'])
  })

  it('build로 조건을 얹을 수 있다', async () => {
    const { q } = fakeTable(3)
    let built = false
    await fetchAllRows(() => q, { build: query => { built = true; return query.eq('event_id', 'e1') } })
    expect(built).toBe(true)
  })

  it('에러가 오면 던진다 (조용히 빈 배열로 넘어가지 않는다)', async () => {
    const q = {
      order: () => q,
      range: () => q,
      then: resolve => Promise.resolve({ data: null, error: new Error('boom') }).then(resolve),
    }
    await expect(fetchAllRows(() => q)).rejects.toThrow('boom')
  })
})
