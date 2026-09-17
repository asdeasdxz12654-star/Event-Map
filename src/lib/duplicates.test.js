import { describe, expect, it } from 'vitest'
import { findDuplicates, looseTitle, normalizedTitle } from './duplicates'

// 중복 판정.
//
// 틀리는 방향이 두 가지고, 화면에서는 둘 다 똑같이 생겼다 —
// 못 잡으면 "중복 의심 0"이 뜨는데 실제로는 한 행사가 세 줄이고(실제로 그랬다),
// 과하게 잡으면 매일 아침 멀쩡한 행사들이 목록에 올라와서 아무도 안 보게 된다.
//
// 여기 있는 사례는 전부 실제로 DB에 들어왔던 것들이다.

const ev = (id, title, start, end = start) =>
  ({ id, title, start_date: start, end_date: end })

describe('normalizedTitle — SQL과 같은 규칙', () => {
  it('띄어쓰기를 뗀다 (호요랜드2026 / 호요랜드 2026)', () => {
    expect(normalizedTitle('호요랜드 2026')).toBe(normalizedTitle('호요랜드2026'))
  })

  it('가운뎃점·문장부호를 뗀다', () => {
    expect(normalizedTitle('코스·앤·코믹')).toBe(normalizedTitle('코스앤코믹'))
  })

  it('글자는 건드리지 않는다 — 회차가 다르면 다른 제목이다', () => {
    expect(normalizedTitle('코믹월드 337 울산')).not.toBe(normalizedTitle('코믹월드 338 수원'))
  })
})

describe('looseTitle — 괄호와 회차까지 뗀다', () => {
  it('부천 세 건이 같은 값이 된다', () => {
    const a = looseTitle('제29회 부천국제만화축제')
    expect(looseTitle('제29회 부천국제만화축제(BICOF)')).toBe(a)
    expect(looseTitle('부천 국제만화축제')).toBe(a)
  })

  it('괄호를 문장부호 제거보다 먼저 처리한다', () => {
    // 순서가 바뀌면 괄호만 사라지고 안의 글자가 제목에 붙는다("…축제bicof").
    expect(looseTitle('부천국제만화축제(BICOF)')).toBe('부천국제만화축제')
    expect(looseTitle('부천국제만화축제(BICOF)')).not.toContain('bicof')
  })

  it('전각 괄호와 대괄호도 뗀다', () => {
    expect(looseTitle('지스타 2026（G-STAR）')).toBe(looseTitle('지스타 2026'))
    expect(looseTitle('[공식] 지스타 2026')).toBe(looseTitle('지스타 2026'))
  })

  it('연도는 떼지 않는다 — 다른 해는 다른 행사다', () => {
    expect(looseTitle('호요랜드 2026')).not.toBe(looseTitle('호요랜드 2027'))
  })

  it('회차는 떼지만, 그래서 날짜를 함께 봐야 한다', () => {
    // 이것만으로 중복이라고 하면 안 된다. findDuplicates가 기간까지 본다.
    expect(looseTitle('제94회 코스앤코믹 페스티벌')).toBe(looseTitle('제95회 코스앤코믹 페스티벌'))
  })

  it('회차 형태가 아닌 번호는 남긴다', () => {
    // "코믹월드 337"의 337은 회차 표기(제N회)가 아니라 이름의 일부다.
    expect(looseTitle('코믹월드 337 울산')).not.toBe(looseTitle('코믹월드 338 수원'))
  })
})

describe('findDuplicates — 엄격', () => {
  it('제목·시작일이 같으면 잡는다', () => {
    const found = findDuplicates([
      ev('a', '호요랜드 2026', '2026-10-02', '2026-10-05'),
      ev('b', '호요랜드2026', '2026-10-02', '2026-10-05'),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].ids.sort()).toEqual(['a', 'b'])
    expect(found[0].reason).toBe('제목·시작일이 같음')
  })

  it('중복이 없으면 빈 배열', () => {
    expect(findDuplicates([
      ev('a', '지스타 2026', '2026-11-12'),
      ev('b', 'AGF 2026', '2026-12-05'),
    ])).toEqual([])
  })
})

describe('findDuplicates — 느슨', () => {
  // 실제로 2026-09-17 크롤이 만든 상태 그대로다.
  const bucheon = [
    ev('keep', '제29회 부천국제만화축제', '2026-09-18', '2026-09-20'),
    ev('bicof', '제29회 부천국제만화축제(BICOF)', '2026-09-18', '2026-09-20'),
    ev('short', '부천 국제만화축제', '2026-09-18', '2026-09-18'),
  ]

  it('부천 세 건을 한 묶음으로 잡는다', () => {
    const found = findDuplicates(bucheon)
    expect(found).toHaveLength(1)
    expect(found[0].ids.sort()).toEqual(['bicof', 'keep', 'short'])
    expect(found[0].reason).toBe('제목이 사실상 같고 기간이 겹침')
  })

  it('왜 걸렸는지를 함께 준다', () => {
    // 제목이 눈에 띄게 다를 수 있어서, 이유가 없으면 사람이 매번 다시 판단해야 한다.
    expect(findDuplicates(bucheon)[0].reason).toContain('기간이 겹침')
  })

  it('회차만 다른 연속 행사는 안 잡는다 — 이름이 원래 같고 날짜가 가른다', () => {
    const found = findDuplicates([
      ev('n94', '제94회 코스앤코믹 페스티벌', '2026-09-19', '2026-09-20'),
      ev('n95', '제95회 코스앤코믹 페스티벌', '2026-10-17', '2026-10-18'),
    ])
    expect(found).toEqual([])
  })

  it('기간이 하루라도 겹치면 잡는다', () => {
    const found = findDuplicates([
      ev('a', '제1회 무슨 페스티벌', '2026-05-01', '2026-05-03'),
      ev('b', '무슨 페스티벌', '2026-05-03', '2026-05-06'),
    ])
    expect(found).toHaveLength(1)
  })

  it('하루 차이로 안 겹치면 안 잡는다', () => {
    const found = findDuplicates([
      ev('a', '제1회 무슨 페스티벌', '2026-05-01', '2026-05-03'),
      ev('b', '무슨 페스티벌', '2026-05-04', '2026-05-06'),
    ])
    expect(found).toEqual([])
  })

  it('하루짜리 잘못된 행이 둘을 이어주면 셋을 한 묶음으로 본다', () => {
    // 부천이 정확히 이 모양이었다 — 겹침이 A-B, B-C로만 이어진다.
    const found = findDuplicates([
      ev('a', '제1회 무슨 축제', '2026-05-01', '2026-05-02'),
      ev('b', '무슨 축제', '2026-05-02', '2026-05-05'),
      ev('c', '무슨 축제(ABC)', '2026-05-05', '2026-05-07'),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].ids).toHaveLength(3)
  })

  it('같은 것을 두 번 띄우지 않는다', () => {
    // 엄격 쪽에서 이미 잡힌 짝은 느슨 쪽에서도 같은 값이 된다.
    const found = findDuplicates([
      ev('a', '호요랜드 2026', '2026-10-02', '2026-10-05'),
      ev('b', '호요랜드2026', '2026-10-02', '2026-10-05'),
    ])
    expect(found).toHaveLength(1)
  })

  it('end_date가 없어도 깨지지 않는다 (하루짜리로 본다)', () => {
    const found = findDuplicates([
      { id: 'a', title: '제1회 무슨 축제', start_date: '2026-05-01', end_date: null },
      { id: 'b', title: '무슨 축제', start_date: '2026-05-01', end_date: null },
    ])
    expect(found).toHaveLength(1)
  })

  it('제목이 비면 묶지 않는다 — 빈 값끼리 한 묶음이 되면 안 된다', () => {
    expect(findDuplicates([
      ev('a', '', '2026-05-01'),
      ev('b', null, '2026-05-01'),
    ])).toEqual([])
  })
})
