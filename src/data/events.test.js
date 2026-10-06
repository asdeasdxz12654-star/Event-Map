import { describe, it, expect, afterEach, vi } from 'vitest'
import { getEventStatus, filterByStatus, splitByHorizon, upcomingHorizon, STATUS } from './events'

// 이 파일이 가르는 것: 끝난 행사가 "예정" 묶음에 섞이지 않는다.
//
// 홈 목록은 "지난 1년 ~ 앞으로 1년"을 통째로 받아온다(useEvents.js — 1월 1일에 작년
// 행사가 한꺼번에 사라지는 걸 막기 위해서다). 그래서 **끝난 행사가 목록에 안 보이는
// 유일한 근거가 이 함수**다. 여기가 틀리면 첫 화면에 끝난 행사가 올라온다.
//
// 날짜를 고정해 둔다 — 실제 오늘로 테스트하면 "오늘이 행사 첫날"처럼 경계에 걸리는
// 경우가 1년에 며칠만 재현되고, 그 며칠에만 깨지는 테스트가 된다.
const ev = (id, startDate, endDate = startDate) => ({ id, startDate, endDate })

function on(date, fn) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${date}T09:00:00+09:00`))
  try { fn() } finally { vi.useRealTimers() }
}

afterEach(() => vi.useRealTimers())

describe('getEventStatus', () => {
  it('종료일이 지나면 종료', () => {
    on('2026-10-06', () => {
      expect(getEventStatus(ev('a', '2026-10-03', '2026-10-05'))).toBe(STATUS.ENDED)
    })
  })

  it('종료일 당일은 아직 진행중 — 마지막 날 오전에 "종료"로 보이면 안 된다', () => {
    on('2026-10-06', () => {
      expect(getEventStatus(ev('a', '2026-10-04', '2026-10-06'))).toBe(STATUS.ONGOING)
    })
  })

  it('시작일 당일은 진행중', () => {
    on('2026-10-06', () => {
      expect(getEventStatus(ev('a', '2026-10-06', '2026-10-08'))).toBe(STATUS.ONGOING)
    })
  })

  it('하루짜리 행사도 당일엔 진행중', () => {
    on('2026-10-06', () => {
      expect(getEventStatus(ev('a', '2026-10-06'))).toBe(STATUS.ONGOING)
    })
  })

  it('시작 전이면 예정 — 내년 행사도 예정이다(목록 범위가 앞으로 1년이므로)', () => {
    on('2026-10-06', () => {
      expect(getEventStatus(ev('a', '2026-11-19', '2026-11-22'))).toBe(STATUS.UPCOMING)
      expect(getEventStatus(ev('b', '2027-09-20', '2027-09-21'))).toBe(STATUS.UPCOMING)
    })
  })
})

describe('filterByStatus', () => {
  // 목록이 받아오는 범위 그대로 — 1년 전부터 1년 뒤까지.
  const all = [
    ev('last-year', '2025-11-20', '2025-11-23'),
    ev('last-month', '2026-09-05', '2026-09-06'),
    ev('yesterday-end', '2026-10-01', '2026-10-05'),
    ev('today', '2026-10-05', '2026-10-07'),
    ev('this-month', '2026-10-20', '2026-10-21'),
    ev('next-year', '2027-03-14', '2027-03-15'),
  ]

  it('예정 묶음에 끝난 행사가 하나도 없다', () => {
    on('2026-10-06', () => {
      const ids = filterByStatus(all, STATUS.UPCOMING).map(e => e.id)
      expect(ids).toEqual(['this-month', 'next-year'])
    })
  })

  it('세 묶음이 목록 전체를 빠짐없이 한 번씩 나눈다', () => {
    on('2026-10-06', () => {
      const buckets = [STATUS.UPCOMING, STATUS.ONGOING, STATUS.ENDED]
        .flatMap(s => filterByStatus(all, s).map(e => e.id))
      expect(buckets.sort()).toEqual(all.map(e => e.id).sort())
    })
  })
})

// 달 계산 자체는 shared/event-horizon.test.js가 지킨다(연말·윤년·말일 보정).
// 여기서 보는 것은 "브라우저 지역 시간의 오늘"을 제대로 넘기는지뿐이다.
describe('upcomingHorizon', () => {
  it('지역 시간의 오늘을 기준으로 센다', () => {
    expect(upcomingHorizon(new Date(2026, 9, 6))).toBe('2027-04-06')
  })

  it('UTC 날짜가 아니라 지역 날짜로 센다', () => {
    // 지역 자정. UTC+ 지역에서 이 순간의 toISOString()은 아직 전날(10-05)이라,
    // 그걸로 날짜를 뽑으면 지평선이 하루 앞당겨진다. 그래서
    // getFullYear/getMonth/getDate로 만든다. (UTC 환경에서는 둘이 같아서 이 단정이
    // 아무것도 못 잡는다 — 시간대가 앞선 환경에서 갈린다.)
    expect(upcomingHorizon(new Date(2026, 9, 6))).toBe('2027-04-06')
  })

  it('인자를 안 주면 오늘을 쓴다', () => {
    on('2026-12-06', () => expect(upcomingHorizon()).toBe('2027-06-06'))
  })
})

describe('splitByHorizon', () => {
  const list = [
    ev('this-month', '2026-10-20', '2026-10-21'),
    ev('gstar26', '2026-11-19', '2026-11-22'),
    ev('on-horizon', '2027-04-06', '2027-04-07'),
    ev('next-year', '2027-09-20', '2027-09-21'),
  ]

  it('지평선 뒤 행사만 far로 간다', () => {
    on('2026-10-06', () => {
      const { near, far } = splitByHorizon(list)
      expect(near.map(e => e.id)).toEqual(['this-month', 'gstar26', 'on-horizon'])
      expect(far.map(e => e.id)).toEqual(['next-year'])
    })
  })

  it('지평선 당일은 안쪽이다', () => {
    on('2026-10-06', () => {
      expect(splitByHorizon([ev('a', '2027-04-06')]).far).toEqual([])
    })
  })

  it('아무것도 버리지 않는다 — far는 접히는 것이고 사라지는 게 아니다', () => {
    on('2026-10-06', () => {
      const { near, far } = splitByHorizon(list)
      expect([...near, ...far].map(e => e.id).sort()).toEqual(list.map(e => e.id).sort())
    })
  })

  it('startDate가 없는 행사는 안쪽에 둔다 (조용히 사라지지 않게)', () => {
    on('2026-10-06', () => {
      const { near, far } = splitByHorizon([{ id: 'x', startDate: null, endDate: null }])
      expect(near.map(e => e.id)).toEqual(['x'])
      expect(far).toEqual([])
    })
  })
})
