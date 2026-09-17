import { describe, expect, it } from 'vitest'
import { URL_COLUMNS, assertOneOf, assertUrlColumns, isHttpUrl } from './validate.js'

// 저장되기 전에 막아야 하는 값들.
//
// 여기를 통과한 값은 곧 화면의 <a href>·<img src>가 된다. DB에 들어가고 나면
// 프론트·미리보기 함수·ICS 내보내기까지 전부가 그 값을 쓰기 때문에, 막는 자리는
// 여기 한 곳이 제일 싸다.

describe('isHttpUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c',
    'https://한글.도메인/경로',
  ])('%s은 통과', value => expect(isHttpUrl(value)).toBe(true))

  it.each([
    ['javascript 스킴', 'javascript:alert(1)'],
    ['대문자로 감춘 javascript', 'JavaScript:alert(1)'],
    ['data 스킴', 'data:text/html,<script>alert(1)</script>'],
    ['파일 스킴', 'file:///etc/passwd'],
    ['주소가 아님', '그냥 글자'],
    ['빈 값', ''],
    ['공백만', ' '],
    ['문자열이 아님', 123],
    ['null', null],
  ])('%s은 막는다', (_name, value) => expect(isHttpUrl(value)).toBe(false))
})

describe('assertUrlColumns', () => {
  it('빈 값은 "지우기"라 통과시킨다', () => {
    // 조용히 버리면 관리자는 저장된 줄 알고 화면을 떠난다. 반대로 빈 값을 막으면
    // 잘못 넣은 주소를 지울 방법이 없어진다.
    expect(assertUrlColumns({ poster_url: null })).toEqual({ poster_url: null })
    expect(assertUrlColumns({ poster_url: '' })).toEqual({ poster_url: '' })
  })

  it('정상 주소는 통과', () => {
    const data = { poster_url: 'https://x/p.jpg', title: 'a' }
    expect(assertUrlColumns(data)).toBe(data)
  })

  it.each(URL_COLUMNS)('%s에 javascript: 를 넣으면 400', column => {
    expect(() => assertUrlColumns({ [column]: 'javascript:alert(1)' }))
      .toThrowError(expect.objectContaining({ status: 400, code: 'invalid_url' }))
  })

  it('URL이 아닌 컬럼은 검사하지 않는다', () => {
    // description에 "javascript:"로 시작하는 문장이 들어갈 수도 있다. 그건 링크가 아니다.
    expect(() => assertUrlColumns({ description: 'javascript:는 스킴 이름이다' })).not.toThrow()
  })
})

describe('assertOneOf', () => {
  it('아는 값은 그대로 돌려준다', () => {
    expect(assertOneOf('open', ['open', 'resolved'])).toBe('open')
  })

  it('모르는 값은 400 — 이 값이 PostgREST 쿼리에 그대로 들어간다', () => {
    expect(() => assertOneOf('open;drop', ['open', 'resolved']))
      .toThrowError(expect.objectContaining({ status: 400, code: 'invalid_status' }))
  })

  it('코드를 바꿀 수 있다', () => {
    expect(() => assertOneOf('x', ['a'], 'invalid_kind'))
      .toThrowError(expect.objectContaining({ code: 'invalid_kind' }))
  })
})
