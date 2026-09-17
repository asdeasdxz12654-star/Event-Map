import { describe, expect, it } from 'vitest'
import { errorText, redactSecrets } from './job-run.mjs'

// 실행 기록에 키가 딸려 들어가지 않는가.
//
// 외부 API가 4xx를 줄 때 우리가 보낸 요청을 통째로 메시지에 실어 돌려주는 경우가 있다.
// 그걸 그대로 job_runs에 넣으면 SerpAPI·네이버 키가 DB에 저장된다. job_runs는 공개
// select를 열지 않았지만, 그 한 겹만 믿지 않는다.

describe('redactSecrets', () => {
  it.each([
    ['api_key', 'https://serpapi.com/search?q=a&api_key=SECRET&num=5', 'SECRET'],
    ['apikey', 'https://x/y?apikey=SECRET', 'SECRET'],
    ['serviceKey', 'http://api.go.kr/list?serviceKey=SECRET&page=1', 'SECRET'],
    ['client_secret', 'https://x?client_secret=SECRET&id=1', 'SECRET'],
    ['access_token', 'https://x?access_token=SECRET', 'SECRET'],
    ['password', 'https://x?password=SECRET', 'SECRET'],
  ])('%s 값을 지운다', (_name, input, secret) => {
    const out = redactSecrets(input)
    expect(out).not.toContain(secret)
    expect(out).toContain('***')
  })

  it('키 뒤에 붙은 다른 파라미터는 살린다', () => {
    // 전부 지워버리면 무엇을 부르다 실패했는지 알 수 없게 된다.
    expect(redactSecrets('https://x/search?api_key=SECRET&q=지스타'))
      .toBe('https://x/search?api_key=***&q=지스타')
  })

  it('Bearer 토큰을 지운다', () => {
    expect(redactSecrets('Authorization: Bearer sk-live-abc.123 rejected'))
      .toBe('Authorization: Bearer *** rejected')
  })

  it('JWT를 지운다 (service_role 키가 이 모양이다)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.sIgNaTuRe'
    expect(redactSecrets(`insert 실패 ${jwt} 401`)).toBe('insert 실패 *** 401')
  })

  it('지울 게 없으면 그대로 둔다', () => {
    expect(redactSecrets('회차 목록을 못 읽었습니다')).toBe('회차 목록을 못 읽었습니다')
  })

  it('빈 값은 null이다', () => {
    expect(redactSecrets('')).toBeNull()
    expect(redactSecrets(null)).toBeNull()
    expect(redactSecrets(undefined)).toBeNull()
  })
})

describe('errorText', () => {
  it('Error의 스택을 쓴다 — 어디서 났는지가 원인 파악에 필요하다', () => {
    const text = errorText(new Error('boom'))
    expect(text).toContain('boom')
    expect(text.split('\n').length).toBeGreaterThan(1)
  })

  it('Error가 아닌 것도 받는다', () => {
    expect(errorText('그냥 문자열')).toBe('그냥 문자열')
  })

  it('길면 자른다 (화면에 한 줄로 뜬다)', () => {
    const text = errorText(new Error('가'.repeat(5000)))
    expect(text.length).toBeLessThanOrEqual(601)
    expect(text.endsWith('…')).toBe(true)
  })

  it('자르기 전에 지운다 — 뒤쪽에 있던 키가 살아남지 않게', () => {
    const long = `${'x'.repeat(400)} https://x?api_key=SECRET&q=1`
    expect(errorText(long)).not.toContain('SECRET')
  })
})
