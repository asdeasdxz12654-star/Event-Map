// 관리자 인증 — 세션 토큰, 비밀번호 검증, 로그인 잠금.
//
// 이 파일만 비밀번호 해시와 서명 키를 만진다. 다른 곳에서 env.SESSION_SECRET이나
// env.ADMIN_PASSWORD_HASH를 읽지 않게 여기로 모았다.
import { counterStore, clientIp } from './rate-limit.js'

// 세션 토큰 수명. 길면 토큰 유출의 창이 길어지고, 짧으면 작업 중에 끊긴다.
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

// 로그인 잠금. 한 IP가 이 횟수를 넘겨 틀리면 잠기고, 더 틀릴수록 잠금이 길어진다.
export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_LOCK_BASE_MS = 10 * 60 * 1000
export const LOGIN_LOCK_MAX_MS = 24 * 60 * 60 * 1000

// IP를 바꿔가며 시도하는 경우를 위한 전체 시도량 기준. 잠그지 않고 늦추기만 한다 —
// 전체를 잠그면 공격자가 아무 비밀번호나 계속 넣는 것만으로 진짜 관리자의 로그인을
// 막을 수 있다.
export const LOGIN_GLOBAL_THROTTLE_AFTER = 20
export const LOGIN_GLOBAL_THROTTLE_MS = 2000
// 틀렸을 때의 기본 지연. 초당 수천 번 찔러보는 것을 막는다.
export const LOGIN_FAILURE_DELAY_MS = 400

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

// 세션 토큰 = "만료시각.HMAC서명" — Worker가 상태 없이(별도 저장소 없이) 자체 검증
// 가능한 형태. 페이로드에 비밀번호/해시가 전혀 안 들어가므로 토큰이 유출돼도 비밀번호를
// 역산할 수 없고, 만료시각이 지나면 서명이 맞아도 거부된다.
export async function issueSessionToken(env) {
  const payload = String(Date.now() + SESSION_TTL_MS)
  const key = await hmacKey(env.SESSION_SECRET)
  const sig = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  return `${payload}.${sig}`
}

export async function verifySessionToken(token, env) {
  if (!token || !env.SESSION_SECRET) return false
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const payload = token.slice(0, dot)
  const sigHex = token.slice(dot + 1)
  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false
  if (!/^[0-9a-f]+$/.test(sigHex) || sigHex.length % 2 !== 0) return false
  const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const key = await hmacKey(env.SESSION_SECRET)
  // crypto.subtle.verify는 상수 시간 비교라 타이밍 사이드채널에 안전하다.
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
}

export async function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  return verifySessionToken(auth.slice(7), env)
}

// --- 비밀번호 검증 -------------------------------------------------------
// ADMIN_PASSWORD_HASH는 두 형식을 받는다.
//   pbkdf2$<반복횟수>$<salt(base64)>$<해시(base64)>   ← 권장. scripts/hash-password.mjs로 생성
//   <64자리 hex>                                      ← 예전 형식(salt 없는 SHA-256 1회)
// 예전 형식은 시크릿이 유출됐을 때 오프라인 크랙이 사실상 즉시 끝난다(GPU로 초당 수십억 회).
// 새 형식으로 바꾸면 같은 유출 상황에서도 반복 횟수만큼 비용이 곱해진다.
// 비교는 두 형식 모두 상수 시간으로 한다 — 앞자리부터 맞춰가며 정답을 좁히지 못하게.
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function verifyPassword(password, stored) {
  if (!password || !stored) return false

  if (stored.startsWith('pbkdf2$')) {
    const [, iterationsRaw, saltB64, hashB64] = stored.split('$')
    const iterations = Number(iterationsRaw)
    if (!Number.isFinite(iterations) || iterations < 1000 || !saltB64 || !hashB64) return false
    let salt, expected
    try {
      salt = base64ToBytes(saltB64)
      expected = base64ToBytes(hashB64)
    } catch {
      return false
    }
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      expected.length * 8
    )
    return timingSafeEqual(new Uint8Array(bits), expected)
  }

  const hex = await sha256hex(password)
  return timingSafeEqual(new TextEncoder().encode(hex), new TextEncoder().encode(stored.trim().toLowerCase()))
}

// --- 로그인 잠금 ---------------------------------------------------------

// 실패가 쌓일수록 잠기는 시간이 배로 늘어난다 (10분 → 20분 → 40분 ... 최대 24시간).
export function lockDurationMs(failures) {
  const over = Math.max(0, failures - LOGIN_MAX_FAILURES)
  return Math.min(LOGIN_LOCK_BASE_MS * 2 ** over, LOGIN_LOCK_MAX_MS)
}

// 잠겨 있으면 남은 초(Retry-After), 아니면 0.
export async function loginLockedFor(request, env) {
  const record = await counterStore(env).get(`login:${clientIp(request)}`)
  if (!record?.lockedUntil || record.lockedUntil <= Date.now()) return 0
  return Math.ceil((record.lockedUntil - Date.now()) / 1000)
}

export async function recordLoginFailure(request, env) {
  const store = counterStore(env)
  const key = `login:${clientIp(request)}`
  const now = Date.now()
  const prev = await store.get(key)
  // 마지막 실패로부터 창이 지났으면 카운터를 처음부터 다시 센다.
  const failures = (prev && prev.expiresAt > now ? prev.failures : 0) + 1
  const lockedUntil = failures >= LOGIN_MAX_FAILURES ? now + lockDurationMs(failures) : 0
  const expiresAt = Math.max(now + LOGIN_WINDOW_MS, lockedUntil)
  await store.put(key, { failures, lockedUntil, expiresAt }, Math.ceil((expiresAt - now) / 1000))

  // IP를 바꿔가며 시도하면 위 카운터를 우회할 수 있어서, 전체 시도량도 따로 센다.
  const globalKey = 'login:__all__'
  const prevGlobal = await store.get(globalKey)
  const globalFailures = (prevGlobal && prevGlobal.expiresAt > now ? prevGlobal.failures : 0) + 1
  const globalExpiresAt = prevGlobal && prevGlobal.expiresAt > now ? prevGlobal.expiresAt : now + LOGIN_WINDOW_MS
  await store.put(globalKey, { failures: globalFailures, expiresAt: globalExpiresAt }, Math.ceil((globalExpiresAt - now) / 1000))
  return globalFailures
}

export async function clearLoginFailures(request, env) {
  await counterStore(env).delete(`login:${clientIp(request)}`)
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
