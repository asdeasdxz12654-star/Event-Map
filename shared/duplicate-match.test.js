import { describe, expect, it } from 'vitest'
import { findSuspectedDuplicate } from './duplicate-match.mjs'

// 자동 승인 직전의 중복 보류.
//
// 틀리는 방향이 둘이다. 못 잡으면 방문자 목록에 같은 행사가 두 줄로 올라가고,
// 과하게 잡으면 멀쩡한 행사가 검수 대기에 쌓인다. 뒤쪽은 승인 한 번이면 풀리지만
// 매일 쌓이면 아무도 안 보게 되므로, 다른 회차·다른 해는 반드시 통과해야 한다.

const ev = (id, title, start, end = start, venue = null) =>
  ({ id, title, start_date: start, end_date: end, venue })
const draft = (title, start, end = start, venue = null) =>
  ({ title, start_date: start, end_date: end, venue })

describe('보류한다', () => {
  it('연도 위치만 다르다 (지스타 2026 / 2026 지스타)', () => {
    const found = findSuspectedDuplicate(
      draft('2026 지스타', '2026-11-13', '2026-11-16'),
      [ev('a', '지스타 2026', '2026-11-12', '2026-11-15')],
    )
    expect(found?.event.id).toBe('a')
  })

  it('지역 접두사와 괄호 약칭이 붙었다', () => {
    const found = findSuspectedDuplicate(
      draft('[서울] 제29회 부천국제만화축제(BICOF)', '2026-09-18'),
      [ev('a', '부천 국제만화축제', '2026-09-18', '2026-09-20')],
    )
    expect(found?.event.id).toBe('a')
  })

  it('제목이 달라도 같은 장소에서 기간이 겹친다 (지스타 / G-STAR)', () => {
    const found = findSuspectedDuplicate(
      draft('G-STAR 2026', '2026-11-12', '2026-11-15', '벡스코'),
      [ev('a', '지스타 2026', '2026-11-12', '2026-11-15', '벡스코 제1전시장')],
    )
    expect(found?.reason).toBe('같은 장소에서 기간이 겹침')
  })
})

describe('보류하지 않는다', () => {
  it('엄격 규칙에 걸리면 트리거가 연결하므로 승인해야 한다', () => {
    expect(findSuspectedDuplicate(
      draft('호요랜드2026', '2026-09-20', '2026-09-21', '킨텍스'),
      [ev('a', '호요랜드 2026', '2026-09-20', '2026-09-21', '킨텍스')],
    )).toBeNull()
  })

  it('회차가 다르면 날짜도 다르다 (코스앤코믹 94 / 95)', () => {
    expect(findSuspectedDuplicate(
      draft('제95회 코스앤코믹', '2026-12-05', '2026-12-06', 'SETEC'),
      [ev('a', '제94회 코스앤코믹', '2026-10-10', '2026-10-11', 'SETEC')],
    )).toBeNull()
  })

  it('같은 이름이라도 다른 해다 (호요랜드 2026 / 2027)', () => {
    expect(findSuspectedDuplicate(
      draft('호요랜드 2027', '2027-09-18'),
      [ev('a', '호요랜드 2026', '2026-09-20', '2026-09-21')],
    )).toBeNull()
  })

  it('장소가 비어 있으면 장소로 묶지 않는다', () => {
    expect(findSuspectedDuplicate(
      draft('메이플스토리 오케스트라', '2026-11-14'),
      [ev('a', '지스타 2026', '2026-11-12', '2026-11-15')],
    )).toBeNull()
  })

  it('제목이나 날짜가 없으면 판단하지 않는다', () => {
    const events = [ev('a', '지스타 2026', '2026-11-12', '2026-11-15', '벡스코')]
    expect(findSuspectedDuplicate(draft(null, '2026-11-12', '2026-11-12', '벡스코'), events)).toBeNull()
    expect(findSuspectedDuplicate(draft('지스타 2026', null, null, '벡스코'), events)).toBeNull()
  })
})
