import { beforeEach, describe, expect, it } from 'vitest'
import { __resetMemoryStore, clientIp, counterStore, rateExceeded } from './rate-limit.js'

// IP당 요청 수 세기.
//
// 여기서 실제로 있었던 고장: 제보 속도 제한이 **아무것도 안 막고 있었다.**
// 메모리 Map만 쓰면 Cloudflare가 요청을 여러 아이솔레이트로 흩뿌리기 때문에
// "1시간에 5건"이 아니라 "아이솔레이트마다 5건"이 된다. 7번 연속으로 보내봤더니
// 전부 201로 통과했다. 화면상으로는 아무 문제도 안 보인다 — 막히지 않는 것이 고장이다.

const req = ip => new Request('https://x/', { headers: { 'CF-Connecting-IP': ip } })
const opts = { prefix: 'test', limit: 3, windowMs: 60_000 }

beforeEach(() => __resetMemoryStore())

describe('clientIp', () => {
  it('CF-Connecting-IP를 읽는다', () => {
    expect(clientIp(req('1.2.3.4'))).toBe('1.2.3.4')
  })
  it('헤더가 없으면 unknown — 그래도 세긴 센다', () => {
    expect(clientIp(new Request('https://x/'))).toBe('unknown')
  })
})

describe('rateExceeded', () => {
  it('한도까지는 0을 준다', async () => {
    for (let i = 0; i < opts.limit; i++) {
      expect(await rateExceeded(req('1.1.1.1'), {}, opts), `${i + 1}번째`).toBe(0)
    }
  })

  it('한도를 넘으면 남은 초를 준다', async () => {
    for (let i = 0; i < opts.limit; i++) await rateExceeded(req('1.1.1.1'), {}, opts)
    const retryAfter = await rateExceeded(req('1.1.1.1'), {}, opts)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })

  it('IP마다 따로 센다', async () => {
    for (let i = 0; i < opts.limit + 2; i++) await rateExceeded(req('1.1.1.1'), {}, opts)
    expect(await rateExceeded(req('2.2.2.2'), {}, opts)).toBe(0)
  })

  it('용도마다 따로 센다', async () => {
    // 한 사람이 오류를 많이 겪었다는 이유로 그 사람의 제보까지 막히면 안 된다.
    const request = req('1.1.1.1')
    for (let i = 0; i < opts.limit + 2; i++) {
      await rateExceeded(request, {}, { ...opts, prefix: 'clienterr' })
    }
    expect(await rateExceeded(request, {}, { ...opts, prefix: 'report' })).toBe(0)
  })

  it('창이 지나면 0부터 다시 센다', async () => {
    const request = req('1.1.1.1')
    const short = { ...opts, windowMs: 1 }
    for (let i = 0; i < opts.limit + 2; i++) await rateExceeded(request, {}, short)
    await new Promise(r => setTimeout(r, 5))
    expect(await rateExceeded(request, {}, short)).toBe(0)
  })

  it('KV가 붙어 있으면 KV를 쓴다', async () => {
    // 운영에서는 이쪽이다. 메모리 폴백은 아이솔레이트마다 따로 세서 실제로는 안 막힌다.
    const kv = new Map()
    const env = {
      LOGIN_RATE_LIMIT: {
        get: async key => (kv.has(key) ? JSON.parse(kv.get(key)) : null),
        put: async (key, value) => { kv.set(key, value) },
        delete: async key => { kv.delete(key) },
      },
    }
    for (let i = 0; i < opts.limit; i++) {
      expect(await rateExceeded(req('1.1.1.1'), env, opts)).toBe(0)
    }
    expect(await rateExceeded(req('1.1.1.1'), env, opts)).toBeGreaterThan(0)
    expect(kv.size).toBe(1)
    expect([...kv.keys()][0]).toBe('test:1.1.1.1')
  })
})

describe('counterStore', () => {
  it('KV 바인딩이 없으면 메모리로라도 센다', async () => {
    // 바인딩을 빠뜨린 배포가 "무제한 시도 가능" 상태로 열려 있는 것보다는 낫다.
    const store = counterStore({})
    await store.put('k', { count: 1 }, 60)
    expect(await store.get('k')).toEqual({ count: 1 })
    await store.delete('k')
    expect(await store.get('k')).toBeNull()
  })

  it('메모리 항목은 만료되면 사라진다', async () => {
    const store = counterStore({})
    await store.put('k', { count: 1 }, 0.001)
    await new Promise(r => setTimeout(r, 5))
    expect(await store.get('k')).toBeNull()
  })

  it('KV TTL은 최소 60초로 올린다 (KV가 그보다 짧은 값을 거부한다)', async () => {
    let seen = null
    const store = counterStore({
      LOGIN_RATE_LIMIT: { get: async () => null, put: async (_k, _v, o) => { seen = o }, delete: async () => {} },
    })
    await store.put('k', {}, 1)
    expect(seen.expirationTtl).toBe(60)
  })
})
