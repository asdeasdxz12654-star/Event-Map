import { afterEach, describe, expect, it, vi } from 'vitest'
import { compactKST, monthDayKST, monthKST, todayKST } from './date-kst.mjs'

// 한국 시간 기준 날짜.
//
// 여기가 하루 어긋나면 화면에는 아무 표시도 안 난다. 크롤러가 조용히 다른 날을 훑고,
// 어제 열린 행사를 "예정"으로, 오늘 열리는 행사를 "지났다"고 본다.
//
// 이 파일에 적힌 사고가 실제로 있었다 — 크롤 워크플로가 21:00 UTC에 도는데, 그 시각은
// 이미 KST로 다음 날이다. new Date()의 getDate()는 실행 환경(UTC) 기준이라 매 실행이
// 정확히 어긋나는 구간에 있었다. "9월 30일"로 판단해 10월 쿼리를 통째로 건너뛰었다.

afterEach(() => vi.useRealTimers())

// 그 시각에 시계를 고정한다.
const at = iso => vi.setSystemTime(new Date(iso))

describe('todayKST', () => {
  it('UTC로는 아직 전날인 시각에 KST 날짜를 준다', () => {
    vi.useFakeTimers()
    // 크롤이 실제로 도는 시각. UTC로는 9/30이지만 한국은 이미 10/1 06:00이다.
    at('2026-09-30T21:00:00Z')
    expect(todayKST()).toBe('2026-10-01')
  })

  it('KST 자정 직전은 아직 그날이다', () => {
    vi.useFakeTimers()
    at('2026-09-30T14:59:00Z') // KST 23:59
    expect(todayKST()).toBe('2026-09-30')
  })

  it('KST 자정을 넘기면 다음 날', () => {
    vi.useFakeTimers()
    at('2026-09-30T15:00:00Z') // KST 익일 00:00
    expect(todayKST()).toBe('2026-10-01')
  })

  it('해를 넘기는 경계', () => {
    vi.useFakeTimers()
    at('2026-12-31T15:00:00Z')
    expect(todayKST()).toBe('2027-01-01')
  })

  it('앞뒤로 밀 수 있다', () => {
    vi.useFakeTimers()
    at('2026-10-01T03:00:00Z')
    expect(todayKST(-1)).toBe('2026-09-30')
    expect(todayKST(0)).toBe('2026-10-01')
    expect(todayKST(7)).toBe('2026-10-08')
  })

  it('월말을 넘어 밀어도 맞다', () => {
    vi.useFakeTimers()
    at('2026-10-31T03:00:00Z')
    expect(todayKST(1)).toBe('2026-11-01')
  })
})

describe('compactKST — 공공 API 파라미터 형식', () => {
  it('YYYYMMDD', () => {
    vi.useFakeTimers()
    at('2026-09-30T21:00:00Z')
    expect(compactKST()).toBe('20261001')
  })

  it('todayKST와 같은 날을 가리킨다', () => {
    vi.useFakeTimers()
    at('2026-09-30T21:00:00Z')
    expect(compactKST(3)).toBe(todayKST(3).replaceAll('-', ''))
  })
})

describe('monthKST / monthDayKST', () => {
  it('KST 기준 달을 준다 (UTC로 전달이어도)', () => {
    vi.useFakeTimers()
    at('2026-09-30T21:00:00Z')
    expect(monthKST()).toBe(10)
  })

  it('숫자다 — 문자열 "10"이면 비교가 조용히 틀어진다', () => {
    vi.useFakeTimers()
    at('2026-10-05T03:00:00Z')
    expect(typeof monthKST()).toBe('number')
  })

  it('monthDayKST는 연도를 뺀다', () => {
    vi.useFakeTimers()
    at('2026-09-30T21:00:00Z')
    expect(monthDayKST()).toBe('10-01')
  })
})
