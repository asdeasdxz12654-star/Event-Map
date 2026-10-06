import { describe, expect, it } from 'vitest'
import { eventDateLabel } from './eventDateLabel'

// 카드에 적히는 기간 문자열.
//
// 여기가 틀려도 화면은 멀쩡해 보인다 — 날짜가 그냥 하나 적혀 있을 뿐이다. 다만 목록이
// 앞뒤 1년을 담으므로 같은 달이 두 번 나올 수 있어서, 연도가 빠지면 "10월 5일"이 작년
// 행사인지 올해 행사인지 가릴 수 없다. 그 경계만 지킨다.
const ev = (startDate, endDate = startDate) => ({ startDate, endDate })

// 그 해에 보고 있다고 치고.
const inYear = y => ({ today: new Date(y, 5, 1) })

describe('eventDateLabel (1열, 긴 형식)', () => {
  it('올해 행사면 연도를 붙이지 않는다', () => {
    expect(eventDateLabel(ev('2026-11-19'), inYear(2026))).toBe('11월 19일 (목)')
  })

  it('내년 행사면 연도를 붙인다', () => {
    expect(eventDateLabel(ev('2027-03-14'), inYear(2026))).toBe('2027년 3월 14일 (일)')
  })

  it('작년 행사면 연도를 붙인다 — 종료 탭에서 같은 달이 두 번 나온다', () => {
    expect(eventDateLabel(ev('2025-10-05'), inYear(2026))).toBe('2025년 10월 5일 (일)')
  })

  it('기간은 시작과 끝을 적고, 요일은 끝에만 붙인다', () => {
    expect(eventDateLabel(ev('2026-11-19', '2026-11-22'), inYear(2026)))
      .toBe('11월 19일 ~ 11월 22일 (일)')
  })

  it('해를 넘기는 기간은 시작 연도만 붙는다', () => {
    expect(eventDateLabel(ev('2027-12-30', '2028-01-02'), inYear(2026)))
      .toBe('2027년 12월 30일 ~ 1월 2일 (일)')
  })
})

describe('eventDateLabel (2열, 짧은 형식)', () => {
  const compactIn = y => ({ compact: true, today: new Date(y, 5, 1) })

  it('올해 행사', () => {
    expect(eventDateLabel(ev('2026-11-19'), compactIn(2026))).toBe('11.19 (목)')
  })

  it('내년 행사는 두 자리 연도를 앞에 붙인다', () => {
    expect(eventDateLabel(ev('2027-03-14'), compactIn(2026))).toBe('27.3.14 (일)')
  })

  it('기간', () => {
    expect(eventDateLabel(ev('2026-11-19', '2026-11-22'), compactIn(2026))).toBe('11.19 – 11.22 (일)')
  })

  it('가장 긴 경우도 2열 한 줄에 들어갈 길이다', () => {
    // 예전에 "11월 14일 ~ 11월 1…"로 끝이 잘린 적이 있어서 짧은 형식을 따로 뒀다.
    // 연도를 붙여도 그때보다 길어지지 않는지 눈으로 확인할 수 있게 길이를 박아둔다.
    const longest = eventDateLabel(ev('2027-12-30', '2028-01-02'), compactIn(2026))
    expect(longest).toBe('27.12.30 – 1.2 (일)')
    expect(longest.length).toBeLessThanOrEqual(20)
  })
})

describe('eventDateLabel (빠진 값)', () => {
  it('시작일이 없으면 빈 문자열 — 카드가 터지지 않게', () => {
    expect(eventDateLabel({ startDate: null })).toBe('')
    expect(eventDateLabel(null)).toBe('')
  })

  it('종료일이 없으면 하루짜리로 본다', () => {
    expect(eventDateLabel({ startDate: '2026-11-19', endDate: null }, inYear(2026)))
      .toBe('11월 19일 (목)')
  })
})
