import { describe, expect, it } from 'vitest'
import { LIMITS, buildPayload, fingerprint, shouldReport } from './errorReporter'

// 오류 수집.
//
// 여기서 틀리면 두 방향으로 쓸모가 없어진다. 남의 고장(브라우저 확장, 끊긴 요청)이
// 섞여 들어와 목록이 잡음으로 덮이거나, 같은 고장이 배포할 때마다 새 줄로 쌓여서
// "어제부터 새로 생긴 것"을 못 찾거나. 둘 다 "오류가 많이 보인다"는 얼굴은 똑같다.

describe('shouldReport — 우리가 고칠 수 없는 것은 안 보낸다', () => {
  it.each([
    ['ResizeObserver loop completed with undelivered notifications.'],
    ['Script error.'],
    ['AbortError: The user aborted a request.'],
    ['TypeError: Failed to fetch'],
    ['Failed to fetch dynamically imported module: /assets/HomePage-x.js'],
    ['Error in reportAllChanges'],
  ])('%s', message => {
    expect(shouldReport(message)).toBe(false)
  })

  it('확장 프로그램 스택은 걸러낸다', () => {
    const stack = 'TypeError: x is null\n    at chrome-extension://abcdef/inject.js:1:1'
    expect(shouldReport('TypeError: x is null', stack)).toBe(false)
  })

  it('빈 메시지는 보낼 것이 없다', () => {
    expect(shouldReport('')).toBe(false)
    expect(shouldReport('   ')).toBe(false)
    expect(shouldReport(null)).toBe(false)
  })

  it('우리 코드의 오류는 보낸다', () => {
    const stack = "TypeError: Cannot read properties of null (reading 'title')\n" +
      '    at EventDetailPage (https://event-map.pages.dev/assets/index-abc.js:120:15)'
    expect(shouldReport("Cannot read properties of null (reading 'title')", stack)).toBe(true)
  })
})

describe('fingerprint — 같은 고장을 같은 줄로 모은다', () => {
  const stack = (file, line) =>
    `TypeError: boom\n    at Foo (https://x/assets/${file}:${line}:9)\n    at Bar (https://x/assets/${file}:99:1)`

  it('같은 자리에서 난 같은 오류는 같은 값', () => {
    expect(fingerprint('boom', stack('index-abc.js', 10)))
      .toBe(fingerprint('boom', stack('index-abc.js', 10)))
  })

  it('줄 번호가 달라져도 같은 값 — 배포할 때마다 새 고장이 되면 안 된다', () => {
    // 번들이 다시 빌드되면 같은 코드의 줄·칸이 통째로 밀린다. 그때마다 새 줄이
    // 생기면 "어제부터 새로 생긴 오류"라는 말이 의미를 잃는다.
    expect(fingerprint('boom', stack('index-abc.js', 10)))
      .toBe(fingerprint('boom', stack('index-abc.js', 884)))
  })

  it('메시지가 다르면 다른 값', () => {
    expect(fingerprint('boom', stack('index-abc.js', 10)))
      .not.toBe(fingerprint('bang', stack('index-abc.js', 10)))
  })

  it('같은 메시지라도 난 자리가 다르면 다른 값', () => {
    const a = 'TypeError: boom\n    at Home (https://x/a.js:1:1)'
    const b = 'TypeError: boom\n    at Detail (https://x/b.js:1:1)'
    expect(fingerprint('boom', a)).not.toBe(fingerprint('boom', b))
  })

  it('스택이 없어도 값을 만든다', () => {
    expect(fingerprint('boom')).toBeTruthy()
    expect(fingerprint('boom')).toBe(fingerprint('boom', ''))
  })
})

describe('buildPayload', () => {
  const err = Object.assign(new Error('무너짐'), {
    stack: 'Error: 무너짐\n    at Foo (https://x/a.js:1:1)',
  })

  it('쿼리스트링은 버린다 — 검색어가 들어 있다', () => {
    const p = buildPayload({ error: err, kind: 'boundary', path: '/?q=내가찾던것&sort=date' })
    expect(p.path).toBe('/')
  })

  it('경로는 남긴다 — 어느 화면에서 났는지가 원인의 절반이다', () => {
    const p = buildPayload({ error: err, kind: 'boundary', path: '/events/abc123' })
    expect(p.path).toBe('/events/abc123')
  })

  it('긴 값은 자른다', () => {
    const big = Object.assign(new Error('가'.repeat(2000)), { stack: '나'.repeat(20000) })
    const p = buildPayload({ error: big, kind: 'error', path: '/', userAgent: '다'.repeat(2000) })
    expect(p.message.length).toBe(LIMITS.message)
    expect(p.stack.length).toBe(LIMITS.stack)
    expect(p.user_agent.length).toBe(LIMITS.userAgent)
  })

  it('Error가 아닌 것도 받는다 (거부된 Promise는 아무거나 담을 수 있다)', () => {
    const p = buildPayload({ error: '문자열로 거부됨', kind: 'unhandledrejection', path: '/' })
    expect(p.message).toBe('문자열로 거부됨')
    expect(p.stack).toBeNull()
  })

  it('아무것도 없어도 빈 메시지를 만들지 않는다', () => {
    const p = buildPayload({ error: undefined, kind: 'error', path: '/' })
    expect(p.message).toBe('알 수 없는 오류')
  })
})
