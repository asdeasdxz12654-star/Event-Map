import { describe, expect, it } from 'vitest'
import { horizonFrom, isBeyondHorizon, UPCOMING_HORIZON_MONTHS } from './event-horizon.mjs'

// 화면과 크롤러가 공유하는 선.
//
// 여기가 어긋나면 양쪽에서 다르게 틀린다 — 목록에서는 내년 행사가 섞여 보이고,
// 크롤러에서는 아무도 못 보는 자리에 행사를 올린다. 그래서 날짜 계산만 따로 지킨다.
// Date를 쓰지 않는 순수 문자열 계산이라 시계를 고정할 필요도 없다.

describe('horizonFrom', () => {
  it('6개월 뒤', () => {
    expect(horizonFrom('2026-10-06')).toBe('2027-04-06')
  })

  it('연말에도 밀려나지 않는다 — 12월의 지평선은 이듬해 6월이다', () => {
    // "올해 남은 것"으로 잘랐을 때 12월에 1월 행사가 사라졌던 함정이 롤링에서는 없다.
    expect(horizonFrom('2026-12-06')).toBe('2027-06-06')
  })

  it('해를 넘겨도 달이 맞는다', () => {
    expect(horizonFrom('2026-07-01')).toBe('2027-01-01')
    expect(horizonFrom('2026-08-01')).toBe('2027-02-01')
  })

  it('그 달에 없는 날짜는 마지막 날로 맞춘다', () => {
    // 8/31 + 6개월 = "2027-02-31"은 없는 날이다. 그냥 넘기면 3월 3일이 된다.
    expect(horizonFrom('2026-08-31')).toBe('2027-02-28')
    // 윤년은 29일까지 있다.
    expect(horizonFrom('2027-08-31')).toBe('2028-02-29')
  })

  it('달 수를 바꿔 부를 수 있다', () => {
    expect(horizonFrom('2026-10-06', 1)).toBe('2026-11-06')
    expect(horizonFrom('2026-10-06', 12)).toBe('2027-10-06')
    expect(horizonFrom('2026-10-06', 0)).toBe('2026-10-06')
  })

  it('기본값은 UPCOMING_HORIZON_MONTHS다', () => {
    expect(horizonFrom('2026-10-06')).toBe(horizonFrom('2026-10-06', UPCOMING_HORIZON_MONTHS))
  })
})

describe('isBeyondHorizon', () => {
  const today = '2026-10-06'

  it('지평선 뒤면 밖이다', () => {
    expect(isBeyondHorizon('2027-09-20', today)).toBe(true)
  })

  it('지평선 안이면 아니다', () => {
    expect(isBeyondHorizon('2026-11-19', today)).toBe(false)
  })

  it('지평선 당일은 안쪽이다', () => {
    expect(isBeyondHorizon('2027-04-06', today)).toBe(false)
  })

  it('날짜가 없으면 밖으로 보지 않는다 — 모르는 것과 먼 것은 다르다', () => {
    // 크롤러에서 이게 true가 되면, 날짜를 못 읽은 행사가 전부 조용히 검수 대기에 쌓인다.
    expect(isBeyondHorizon(null, today)).toBe(false)
    expect(isBeyondHorizon(undefined, today)).toBe(false)
    expect(isBeyondHorizon('', today)).toBe(false)
  })

  it('지난 행사는 밖이 아니다 — 이 함수는 앞쪽만 본다', () => {
    expect(isBeyondHorizon('2025-11-20', today)).toBe(false)
  })
})
