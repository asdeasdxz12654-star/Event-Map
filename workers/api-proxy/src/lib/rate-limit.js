// IP당 요청 수를 센다.
//
// LOGIN_RATE_LIMIT KV가 있으면 그걸 쓰고, 없으면 아이솔레이트 메모리로라도 센다.
// 메모리 폴백은 콜로/아이솔레이트마다 따로 세므로 완벽하진 않지만, KV 바인딩을
// 빠뜨린 배포가 "무제한 시도 가능" 상태로 열려 있는 것보다는 훨씬 낫다.
// 확실한 차단이 필요하면 Cloudflare 대시보드의 Rate Limiting 룰을 앞단에 함께 건다.
//
// 처음엔 제보 쪽을 메모리 Map만으로 막았는데 실제로 재보니 안 걸렸다. Cloudflare는
// 요청을 여러 아이솔레이트·콜로로 흩뿌리고 배포할 때마다 새로 뜨기 때문에, 메모리
// 카운터는 "1시간에 5건"이 아니라 "아이솔레이트마다 5건"이 된다. 7번 연속 요청이
// 전부 201로 통과했다. 그래서 로그인이 쓰던 KV를 같이 쓴다 — 바인딩 이름이
// LOGIN_RATE_LIMIT이지만 용도는 그냥 카운터다.
const memoryStore = new Map()

export function counterStore(env) {
  if (env.LOGIN_RATE_LIMIT) {
    return {
      get: key => env.LOGIN_RATE_LIMIT.get(key, 'json'),
      put: (key, value, ttlSec) =>
        env.LOGIN_RATE_LIMIT.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) }),
      delete: key => env.LOGIN_RATE_LIMIT.delete(key),
    }
  }
  return {
    get: async key => {
      const entry = memoryStore.get(key)
      if (!entry) return null
      if (entry.expiresAt <= Date.now()) { memoryStore.delete(key); return null }
      return entry.value
    },
    put: async (key, value, ttlSec) => {
      memoryStore.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
      // 아이솔레이트가 오래 살아도 키가 무한히 쌓이지 않게 만료된 것들을 정리한다.
      if (memoryStore.size > 500) {
        const now = Date.now()
        for (const [k, v] of memoryStore) if (v.expiresAt <= now) memoryStore.delete(k)
      }
    },
    delete: async key => { memoryStore.delete(key) },
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

// 넘었으면 남은 초(Retry-After), 아니면 0. 창이 지나면 0부터 다시 센다.
//
// prefix로 용도를 가른다. 한 사람이 오류를 많이 겪었다는 이유로 그 사람의 제보까지
// 막히면 안 된다 — 둘은 서로 다른 일이다.
export async function rateExceeded(request, env, { prefix, limit, windowMs }) {
  const key = `${prefix}:${clientIp(request)}`
  const store = counterStore(env)
  const now = Date.now()
  const entry = await store.get(key)

  if (!entry || entry.resetAt <= now) {
    await store.put(key, { count: 1, resetAt: now + windowMs }, Math.ceil(windowMs / 1000))
    return 0
  }

  const next = { count: entry.count + 1, resetAt: entry.resetAt }
  await store.put(key, next, Math.max(60, Math.ceil((entry.resetAt - now) / 1000)))
  return next.count > limit ? Math.ceil((entry.resetAt - now) / 1000) : 0
}

// 테스트에서 아이솔레이트 메모리를 비운다. 검사끼리 카운터를 물려받지 않게.
export function __resetMemoryStore() {
  memoryStore.clear()
}
