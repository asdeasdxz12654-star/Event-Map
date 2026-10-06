import { describe, expect, it } from 'vitest'
import { horizonFrom, isBeyondHorizon, HORIZON_MIN_DAYS } from './event-horizon.mjs'

// 화면과 크롤러가 공유하는 선.
//
// 여기가 어긋나면 양쪽에서 다르게 틀린다 — 목록에서는 내년 행사가 섞여 보이고,
// 크롤러에서는 아무도 못 보는 자리에 행사를 올린다. 그래서 날짜 계산만 따로 지킨다.
// Date를 쓰지 않는(=시계를 고정할 필요가 없는) 순수 문자열 계산으로 둔 이유도 그것이다.
//
// 지키는 성질은 둘이다.
//   1. 1년의 대부분은 "올해 끝"이다 — 내년 행사가 예정 탭에 섞이지 않는다.
//   2. 연말에는 하한이 이긴다 — 삼 주 뒤 행사가 "내년"이라고 접히지 않는다.

describe('horizonFrom — 연중', () => {
  it('올해 12월 31일로 자른다', () => {
    expect(horizonFrom('2026-10-06')).toBe('2026-12-31')
    expect(horizonFrom('2026-01-01')).toBe('2026-12-31')
    expect(horizonFrom('2026-06-30')).toBe('2026-12-31')
  })

  it('해가 바뀌면 그 해 끝으로 옮겨간다', () => {
    expect(horizonFrom('2027-01-05')).toBe('2027-12-31')
  })
})

describe('horizonFrom — 연말 하한', () => {
  // 연도로만 자르면 12월 28일에 들어온 사람은 예정 탭에서 아무것도 못 본다.
  // 삼 주 뒤 행사가 "내년"이라 접히기 때문이다.
  it('하한이 연말을 넘기면 하한이 이긴다', () => {
    expect(horizonFrom('2026-12-20')).toBe('2027-02-18')
    expect(horizonFrom('2026-12-28')).toBe('2027-02-26')
    expect(horizonFrom('2026-12-31')).toBe('2027-03-01')
  })

  it('하한이 이기기 시작하는 날', () => {
    // 11/1 + 60일 = 12/31. 같으면 연말이 남는다.
    expect(horizonFrom('2026-11-01')).toBe('2026-12-31')
    // 하루만 지나면 하한이 연말을 넘어선다.
    expect(horizonFrom('2026-11-02')).toBe('2027-01-01')
  })

  it('윤년 2월을 지나가도 날 수가 맞는다', () => {
    // 2027-12-31 + 60일: 1월 31 + 2월 29(2028 윤년) = 60 -> 2028-02-29
    expect(horizonFrom('2027-12-31')).toBe('2028-02-29')
  })

  it('하한을 바꿔 부를 수 있다', () => {
    expect(horizonFrom('2026-12-20', 10)).toBe('2026-12-31') // 연말이 이김
    expect(horizonFrom('2026-12-20', 90)).toBe('2027-03-20')
  })

  it('기본 하한은 HORIZON_MIN_DAYS다', () => {
    expect(horizonFrom('2026-12-20')).toBe(horizonFrom('2026-12-20', HORIZON_MIN_DAYS))
  })
})

describe('isBeyondHorizon', () => {
  const today = '2026-10-06'

  it('내년 행사는 전부 밖이다 — 이게 이번 변경의 요점이다', () => {
    expect(isBeyondHorizon('2027-01-16', today)).toBe(true)
    expect(isBeyondHorizon('2027-03-13', today)).toBe(true)
    expect(isBeyondHorizon('2027-11-18', today)).toBe(true)
  })

  it('올해 행사는 안쪽이다', () => {
    expect(isBeyondHorizon('2026-11-19', today)).toBe(false)
    expect(isBeyondHorizon('2026-12-31', today)).toBe(false) // 지평선 당일
  })

  it('연말에는 코앞인 내년 초 행사가 안쪽에 남는다', () => {
    // 12월 20일에 보면 1월 16일 행사는 삼 주 뒤다. 접으면 안 된다.
    expect(isBeyondHorizon('2027-01-16', '2026-12-20')).toBe(false)
    expect(isBeyondHorizon('2027-03-13', '2026-12-20')).toBe(true)
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
