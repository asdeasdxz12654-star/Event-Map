import { describe, expect, it } from 'vitest'
import { UA, decodeEntities, htmlToText, httpUrl } from './util.mjs'

// 크롤러 공통 조각.
//
// 여기서 틀리면 틀린 값이 그대로 DB에 들어간다. 크롤러가 넣은 값 중 confidence:high는
// 사람 검수 없이 바로 화면에 뜨므로, 이 함수들이 마지막 문지기다.

describe('httpUrl — 주소가 아니면 null', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c#d',
  ])('%s은 통과', v => expect(httpUrl(v)).toBe(v))

  it.each([
    ['javascript 스킴', 'javascript:alert(1)'],
    ['data 스킴', 'data:text/html,<script>alert(1)</script>'],
    ['파일 스킴', 'file:///etc/passwd'],
    ['주소가 아님', '미정'],
    ['빈 값', ''],
    ['null', null],
    ['숫자', 123],
  ])('%s은 null', (_name, v) => expect(httpUrl(v)).toBeNull())

  it('LLM이 뱉은 값이 그대로 링크가 되지 않게 막는다', () => {
    // ticket_url·website는 기사에서 뽑아낸 값이고, confidence:high면 검수 없이
    // events까지 들어가 상세 화면의 <a href>가 된다.
    expect(httpUrl('예매처 미정')).toBeNull()
    expect(httpUrl('www.example.com')).toBeNull() // 스킴이 없으면 주소가 아니다
  })
})

describe('decodeEntities', () => {
  it('흔한 엔티티를 되돌린다', () => {
    expect(decodeEntities('A&amp;B')).toBe('A&B')
    expect(decodeEntities('&lt;p&gt;')).toBe('<p>')
    expect(decodeEntities('&quot;따옴표&quot;')).toBe('"따옴표"')
    expect(decodeEntities('it&#39;s')).toBe("it's")
  })

  it('&nbsp;를 보통 공백으로 바꾼다', () => {
    // 그냥 두면 행사명 대조에서 "코믹월드 337"이 "코믹월드 337"과 다른 값이 된다.
    expect(decodeEntities('코믹월드&nbsp;337')).toBe('코믹월드 337')
    expect(decodeEntities('코믹월드&#160;337')).toBe('코믹월드 337')
  })

  it('앞뒤 공백을 턴다', () => {
    expect(decodeEntities('  가운데 는 남긴다  ')).toBe('가운데 는 남긴다')
  })

  it('기본값이 있어 undefined로 터지지 않는다', () => {
    expect(decodeEntities()).toBe('')
  })
})

describe('htmlToText', () => {
  it('태그 자리를 공백으로 바꾼다', () => {
    // 붙여서 지우면 서로 다른 줄의 글자가 한 단어로 붙는다.
    expect(htmlToText('<p>개최</p><p>장소</p>')).toBe('개최 장소')
  })

  it('script·style 안쪽을 통째로 버린다', () => {
    expect(htmlToText('<style>.a{color:red}</style>본문')).toBe('본문')
    expect(htmlToText('<script>var a = 1 < 2</script>본문')).toBe('본문')
  })

  it('연속 공백을 하나로 줄인다', () => {
    expect(htmlToText('<div>  가   나  </div>')).toBe('가 나')
  })

  it('엔티티까지 함께 푼다', () => {
    expect(htmlToText('<p>A&amp;B&nbsp;C</p>')).toBe('A&B C')
  })

  it('기본값이 있어 undefined로 터지지 않는다', () => {
    expect(htmlToText()).toBe('')
  })
})

describe('UA', () => {
  it('정체를 밝힌다 — 차단당했을 때 원인을 찾으려면 필요하다', () => {
    expect(UA).toContain('EventMapCrawler')
  })

  it('연락할 곳이 적혀 있다', () => {
    expect(UA).toMatch(/https?:\/\//)
  })
})
