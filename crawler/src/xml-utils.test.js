import { describe, expect, it } from 'vitest'
import { asArray, xmlParser } from './xml-utils.mjs'

// 공공 API(KOPIS·킨텍스·영등위) XML 응답 다루기.
//
// 이 파일의 설정 한 줄(parseTagValue: false)이 실제로 두 가지 고장을 막고 있다.
// 그 한 줄이 언제든 "기본값이 나을 것 같은데" 하고 지워질 수 있어서, 여기에 사고를 박아둔다.

describe('parseTagValue: false — 숫자처럼 보여도 문자열로 둔다', () => {
  it('가격이 "50000"이어도 문자열이다', () => {
    // 숫자가 되면 EventExtractionSchema의 admission_fee(z.string())에 걸려서
    // 그 행사 전체가 "매핑 실패"로 버려졌다.
    const parsed = xmlParser.parse('<db><pcseguidance>50000</pcseguidance></db>')
    expect(parsed.db.pcseguidance).toBe('50000')
    expect(typeof parsed.db.pcseguidance).toBe('string')
  })

  it('공연명이 연도만이어도 문자열이다', () => {
    const parsed = xmlParser.parse('<db><prfnm>2026</prfnm></db>')
    expect(parsed.db.prfnm).toBe('2026')
  })

  it('결과코드 "00"이 숫자 0으로 바뀌지 않는다', () => {
    // 0은 falsy다. `if (code && code !== "00")` 검사가 통째로 죽어서,
    // API가 에러를 줘도 "빈 목록"으로 조용히 넘어갔다.
    const parsed = xmlParser.parse('<response><header><resultCode>00</resultCode></header></response>')
    const code = parsed.response.header.resultCode
    expect(code).toBe('00')
    expect(Boolean(code)).toBe(true)
  })

  it('에러 코드도 문자열로 온다 (검사가 실제로 돈다)', () => {
    const parsed = xmlParser.parse('<response><header><resultCode>99</resultCode></header></response>')
    const code = parsed.response.header.resultCode
    expect(code && code !== '00').toBe(true)
  })

  it('속성도 읽는다', () => {
    const parsed = xmlParser.parse('<row seq="3">값</row>')
    expect(parsed.row['@_seq']).toBe('3')
  })
})

describe('asArray — 항목이 하나면 객체로 오는 것을 정규화한다', () => {
  it('배열은 그대로', () => {
    expect(asArray([1, 2])).toEqual([1, 2])
  })

  it('하나짜리 객체는 배열로 감싼다', () => {
    // 이걸 안 하면 행사가 한 건일 때 .map이 터지거나 조용히 건너뛴다.
    expect(asArray({ id: 1 })).toEqual([{ id: 1 }])
  })

  it('없으면 빈 배열', () => {
    expect(asArray(undefined)).toEqual([])
    expect(asArray(null)).toEqual([])
  })

  it('0과 빈 문자열은 값이다 — 버리지 않는다', () => {
    expect(asArray(0)).toEqual([0])
    expect(asArray('')).toEqual([''])
  })

  it('실제 응답 모양에서 항목 수가 맞는다', () => {
    const one = xmlParser.parse('<dbs><db><mt20id>A</mt20id></db></dbs>')
    const many = xmlParser.parse('<dbs><db><mt20id>A</mt20id></db><db><mt20id>B</mt20id></db></dbs>')
    expect(asArray(one.dbs.db)).toHaveLength(1)
    expect(asArray(many.dbs.db)).toHaveLength(2)
  })
})
