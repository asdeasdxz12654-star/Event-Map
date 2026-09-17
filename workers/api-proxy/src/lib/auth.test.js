import { beforeEach, describe, expect, it } from 'vitest'
import {
  LOGIN_LOCK_MAX_MS, LOGIN_MAX_FAILURES, SESSION_TTL_MS,
  clearLoginFailures, issueSessionToken, lockDurationMs, loginLockedFor,
  recordLoginFailure, timingSafeEqual, verifyAdmin, verifyPassword, verifySessionToken,
} from './auth.js'
import { __resetMemoryStore } from './rate-limit.js'

// 관리자 인증.
//
// 여기가 틀리면 조용히 열린다 — 화면에는 아무 차이가 없고, 잘못된 토큰이 통과하는지는
// 누가 시도해 보기 전까지 알 수 없다. 실제로 이 저장소에서 "SESSION_SECRET이 없어도
// 로그인이 성공하면서 토큰을 내주고, 그 토큰으로는 모든 요청이 401"인 상태가 있었다.

const env = { SESSION_SECRET: 'test-secret-0123456789' }
const reqFrom = ip => new Request('https://x/', { headers: { 'CF-Connecting-IP': ip } })

beforeEach(() => __resetMemoryStore())

describe('세션 토큰', () => {
  it('발급한 토큰은 통과한다', async () => {
    expect(await verifySessionToken(await issueSessionToken(env), env)).toBe(true)
  })

  it('서명을 한 글자만 바꿔도 거부한다', async () => {
    const token = await issueSessionToken(env)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(await verifySessionToken(tampered, env)).toBe(false)
  })

  it('만료시각을 늘려 적으면 거부한다 — 서명이 페이로드를 덮는다', async () => {
    const token = await issueSessionToken(env)
    const sig = token.slice(token.indexOf('.') + 1)
    const far = `${Date.now() + 10 * SESSION_TTL_MS}.${sig}`
    expect(await verifySessionToken(far, env)).toBe(false)
  })

  it('만료된 토큰은 서명이 맞아도 거부한다', async () => {
    // 과거 시각으로 직접 만든다 — 서명은 맞지만 시간이 지났다.
    const payload = String(Date.now() - 1000)
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
    expect(await verifySessionToken(`${payload}.${sig}`, env)).toBe(false)
  })

  it('다른 비밀키로 만든 토큰은 거부한다', async () => {
    const other = await issueSessionToken({ SESSION_SECRET: 'another-secret' })
    expect(await verifySessionToken(other, env)).toBe(false)
  })

  it.each([
    ['빈 값', ''],
    ['점이 없음', 'abcdef'],
    ['페이로드가 숫자가 아님', 'notanumber.deadbeef'],
    ['서명이 hex가 아님', `${Date.now() + 10000}.zzzz`],
    ['서명 길이가 홀수', `${Date.now() + 10000}.abc`],
  ])('%s은 거부한다', async (_name, token) => {
    expect(await verifySessionToken(token, env)).toBe(false)
  })

  it('SESSION_SECRET이 없으면 무조건 거부한다', async () => {
    expect(await verifySessionToken(await issueSessionToken(env), {})).toBe(false)
  })
})

describe('verifyAdmin', () => {
  const withAuth = value => new Request('https://x/', { headers: { Authorization: value } })

  it('Bearer 토큰을 읽는다', async () => {
    const token = await issueSessionToken(env)
    expect(await verifyAdmin(withAuth(`Bearer ${token}`), env)).toBe(true)
  })

  it('Bearer가 아니면 거부한다', async () => {
    const token = await issueSessionToken(env)
    expect(await verifyAdmin(withAuth(token), env)).toBe(false)
    expect(await verifyAdmin(withAuth(`Basic ${token}`), env)).toBe(false)
  })

  it('헤더가 없으면 거부한다', async () => {
    expect(await verifyAdmin(new Request('https://x/'), env)).toBe(false)
  })
})

describe('verifyPassword', () => {
  // 실제 저장 형식 그대로 만든다. scripts/hash-password.mjs와 같은 모양이어야 한다.
  async function pbkdf2Hash(password, iterations = 10000) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
    const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`
  }

  it('pbkdf2 형식을 맞춘다', async () => {
    const stored = await pbkdf2Hash('열려라참깨')
    expect(await verifyPassword('열려라참깨', stored)).toBe(true)
    expect(await verifyPassword('열려라깨참', stored)).toBe(false)
  })

  it('예전 형식(salt 없는 SHA-256)도 아직 받는다', async () => {
    // "test"의 SHA-256. 새 형식으로 옮기기 전 배포가 잠기지 않게 남겨둔 길이다.
    const sha = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    expect(await verifyPassword('test', sha)).toBe(true)
    expect(await verifyPassword('test', sha.toUpperCase())).toBe(true)
    expect(await verifyPassword('nope', sha)).toBe(false)
  })

  it.each([
    ['비밀번호가 빈 값', '', 'anything'],
    ['해시가 없음', 'pw', ''],
    ['해시가 없음(undefined)', 'pw', undefined],
  ])('%s이면 거부한다', async (_name, pw, stored) => {
    expect(await verifyPassword(pw, stored)).toBe(false)
  })

  it.each([
    ['반복 횟수가 너무 적음', 'pbkdf2$10$c2FsdA==$aGFzaA=='],
    ['반복 횟수가 숫자가 아님', 'pbkdf2$abc$c2FsdA==$aGFzaA=='],
    ['조각이 모자람', 'pbkdf2$10000$c2FsdA=='],
    ['base64가 깨짐', 'pbkdf2$10000$!!!$!!!'],
  ])('망가진 pbkdf2 해시(%s)는 통과시키지 않는다', async (_name, stored) => {
    // 형식이 이상하면 "검증 생략"이 아니라 거부여야 한다.
    expect(await verifyPassword('아무거나', stored)).toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('같으면 true', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
  })
  it('한 바이트만 달라도 false', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })
  it('길이가 다르면 false', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

describe('lockDurationMs — 틀릴수록 배로 길어진다', () => {
  it('기준 횟수까지는 기본값', () => {
    expect(lockDurationMs(LOGIN_MAX_FAILURES)).toBe(10 * 60 * 1000)
  })
  it('한 번 더 틀릴 때마다 두 배', () => {
    expect(lockDurationMs(LOGIN_MAX_FAILURES + 1)).toBe(20 * 60 * 1000)
    expect(lockDurationMs(LOGIN_MAX_FAILURES + 2)).toBe(40 * 60 * 1000)
  })
  it('상한을 넘지 않는다 — 무한정 잠그면 진짜 관리자가 못 들어온다', () => {
    expect(lockDurationMs(LOGIN_MAX_FAILURES + 100)).toBe(LOGIN_LOCK_MAX_MS)
  })
})

describe('로그인 잠금', () => {
  it('기준 횟수를 넘기면 잠긴다', async () => {
    const request = reqFrom('1.1.1.1')
    expect(await loginLockedFor(request, {})).toBe(0)
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await recordLoginFailure(request, {})
    expect(await loginLockedFor(request, {})).toBeGreaterThan(0)
  })

  it('다른 IP는 같이 잠기지 않는다', async () => {
    const attacker = reqFrom('9.9.9.9')
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await recordLoginFailure(attacker, {})
    expect(await loginLockedFor(reqFrom('1.2.3.4'), {})).toBe(0)
  })

  it('성공하면 풀린다', async () => {
    const request = reqFrom('2.2.2.2')
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) await recordLoginFailure(request, {})
    await clearLoginFailures(request, {})
    expect(await loginLockedFor(request, {})).toBe(0)
  })

  it('IP를 바꿔가며 시도해도 전체 시도량은 쌓인다', async () => {
    // 여기서는 잠그지 않고 응답을 늦추기만 한다 — 전체를 잠그면 공격자가 아무
    // 비밀번호나 계속 넣는 것만으로 진짜 관리자의 로그인을 막을 수 있다.
    let last = 0
    for (let i = 0; i < 8; i++) last = await recordLoginFailure(reqFrom(`10.0.0.${i}`), {})
    expect(last).toBe(8)
  })
})
