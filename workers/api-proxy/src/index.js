// event-map-api-proxy
//
// 프론트엔드(GitHub Pages)가 API 키를 노출하지 않고 외부 API를 호출하기 위한 중계 Worker.
// 관리자 CRUD 엔드포인트(/admin/*)는 서버 사이드 로그인(POST /admin/login)으로 발급한
// 서명된 세션 토큰(24시간 만료)으로 검증한 뒤 SUPABASE_SERVICE_ROLE_KEY로 DB에 직접 쓴다.
//
// 예전엔 "비밀번호의 SHA-256 해시"를 프론트엔드 번들에 그대로 박아두고 브라우저에서
// 직접 비교했었다 — 그 해시가 공개 번들에 실리는 순간 공격자가 오프라인으로(서버 요청
// 없이, 속도 제한도 안 받고) 얼마든지 크랙 시도를 할 수 있어서 취약했다. 지금은 비밀번호
// 해시를 서버(Worker)에만 두고, 로그인 성공 시에만 HMAC 서명된 만료 토큰을 내려준다 —
// 토큰만 봐서는 비밀번호를 역산할 수 없고, 탈취돼도 24시간 뒤엔 자동 무효화된다.
//
// 시크릿 등록:
//   npx wrangler secret put SUPABASE_URL
//   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
//   npx wrangler secret put ADMIN_PASSWORD_HASH (값: node scripts/hash-password.mjs '비밀번호'
//                                                 출력물. PBKDF2-SHA256 + 무작위 salt이며,
//                                                 예전 형식(64자리 SHA-256 hex)도 계속 받지만
//                                                 유출 시 즉시 크랙되므로 새 형식 권장)
//   npx wrangler secret put SESSION_SECRET      (세션 토큰 서명용 무작위 키. 아무 의미
//                                                 없는 긴 무작위 문자열이면 됨 — 주기적으로
//                                                 바꾸면 그 순간 모든 기존 세션이 무효화됨)
//   npx wrangler secret put ALLOWED_ORIGIN     (값: 프론트엔드 도메인, ex: https://<user>.github.io —
//                                                로컬 개발도 같이 열어두고 싶으면 쉼표로 여러 개:
//                                                "https://<user>.github.io,http://localhost:5173")
//   npx wrangler secret put SEOUL_OPENDATA_KEY (서울 열린데이터광장 인증키. /seoul-congestion 라우트가
//                                                이 키로 서울시 실시간 도시데이터 API를 대신 호출한다 —
//                                                프론트엔드에 키를 직접 박으면 번들에 노출되고, 그
//                                                API가 CORS도 지원 안 해서 브라우저에서 직접 호출 불가)
//
// KV 바인딩(권장): LOGIN_RATE_LIMIT — /admin/login 시도 횟수 카운터. 붙이는 방법은
// wrangler.toml 주석 참고. 안 붙어 있어도 아이솔레이트 메모리로 세긴 하지만(무제한 시도
// 방지), 콜로별로 따로 세기 때문에 운영에서는 KV를 붙이는 걸 권한다.

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

// 로그인 실패 허용치: 같은 IP에서 10분 안에 5번 틀리면 잠근다.
// 잠금 시간은 실패가 이어질수록 배로 늘어난다(10분 → 20분 → … → 최대 24시간).
const LOGIN_MAX_FAILURES = 5
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_LOCK_BASE_MS = 10 * 60 * 1000
const LOGIN_LOCK_MAX_MS = 24 * 60 * 60 * 1000
// IP를 바꿔가며 시도하는 경우에 대비한 전체 시도량 제한. 이 횟수를 넘기면 모든
// 로그인 응답을 늦춰서(차단이 아니라 지연) 초당 시도 횟수를 떨어뜨린다.
const LOGIN_GLOBAL_THROTTLE_AFTER = 20
const LOGIN_GLOBAL_THROTTLE_MS = 2000
// 실패 응답은 항상 이만큼 늦춘다 — 응답 속도 차이로 정답을 좁혀 들어가지 못하게.
const LOGIN_FAILURE_DELAY_MS = 400

function corsHeaders(env = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Retry-After는 CORS 기본 노출 목록에 없다 — 명시하지 않으면 브라우저 JS에서
    // 429의 대기 시간을 읽을 수 없어 안내 문구에 쓸 수가 없다.
    'Access-Control-Expose-Headers': 'Retry-After',
    // ACAO 값이 요청 Origin에 따라 달라지므로 캐시 키에도 Origin이 들어가야 한다.
    // 이게 없으면 Cache-Control이 걸린 응답(/seoul-congestion)에서 A오리진용 ACAO가
    // 박힌 캐시본이 B오리진 요청에 그대로 나가 CORS가 깨진다.
    'Vary': 'Origin',
  }
}

function json(data, env, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(init.headers ?? {}) },
  })
}

// 핸들러 안에서 "이 상태 코드로 응답하고 끝내라"를 던지기 위한 에러.
// 이걸로 감싸지 않은 예외는 전부 500 + 마스킹된 메시지로 나간다.
class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

// 세션 토큰 = "만료시각.HMAC서명" — Worker가 상태 없이(별도 저장소 없이) 자체 검증
// 가능한 형태. 페이로드에 비밀번호/해시가 전혀 안 들어가므로 토큰이 유출돼도 비밀번호를
// 역산할 수 없고, 만료시각이 지나면 서명이 맞아도 거부된다.
async function issueSessionToken(env) {
  const payload = String(Date.now() + SESSION_TTL_MS)
  const key = await hmacKey(env.SESSION_SECRET)
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${payload}.${sig}`
}

async function verifySessionToken(token, env) {
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

async function verifyAdmin(request, env) {
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
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function verifyPassword(password, stored) {
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

// --- 로그인 레이트리밋 ---------------------------------------------------
// LOGIN_RATE_LIMIT KV가 있으면 그걸 쓰고, 없으면 아이솔레이트 메모리로라도 센다.
// 메모리 폴백은 콜로/아이솔레이트마다 따로 세므로 완벽하진 않지만, KV 바인딩을
// 빠뜨린 배포가 "무제한 시도 가능" 상태로 열려 있는 것보다는 훨씬 낫다.
// 확실한 차단이 필요하면 Cloudflare 대시보드의 Rate Limiting 룰을 앞단에 함께 건다.
const memoryStore = new Map()

function counterStore(env) {
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

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

// 실패가 쌓일수록 잠기는 시간이 배로 늘어난다 (10분 → 20분 → 40분 ... 최대 24시간).
function lockDurationMs(failures) {
  const over = Math.max(0, failures - LOGIN_MAX_FAILURES)
  return Math.min(LOGIN_LOCK_BASE_MS * 2 ** over, LOGIN_LOCK_MAX_MS)
}

// 잠겨 있으면 남은 초(Retry-After), 아니면 0.
async function loginLockedFor(request, env) {
  const record = await counterStore(env).get(`login:${clientIp(request)}`)
  if (!record?.lockedUntil || record.lockedUntil <= Date.now()) return 0
  return Math.ceil((record.lockedUntil - Date.now()) / 1000)
}

async function recordLoginFailure(request, env) {
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
  // 여기서는 잠그지 않고 응답을 늦추기만 한다 — 전체를 잠그면 공격자가 아무 비밀번호나
  // 계속 넣는 것만으로 진짜 관리자의 로그인을 막을 수 있기 때문이다.
  const globalKey = 'login:__all__'
  const prevGlobal = await store.get(globalKey)
  const globalFailures = (prevGlobal && prevGlobal.expiresAt > now ? prevGlobal.failures : 0) + 1
  const globalExpiresAt = prevGlobal && prevGlobal.expiresAt > now ? prevGlobal.expiresAt : now + LOGIN_WINDOW_MS
  await store.put(globalKey, { failures: globalFailures, expiresAt: globalExpiresAt }, Math.ceil((globalExpiresAt - now) / 1000))
  return globalFailures
}

async function clearLoginFailures(request, env) {
  await counterStore(env).delete(`login:${clientIp(request)}`)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function supabase(env, method, path, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      // POST뿐 아니라 PATCH도 바뀐 행을 돌려받는다 — return=minimal이면 PostgREST가
      // "0행 수정"도 성공으로 주기 때문에, 없는 id로 PATCH해도 200 {ok:true}가 나갔다.
      // 반환된 배열이 비었는지로 404를 판별하려면 representation이 필요하다.
      'Prefer': method === 'DELETE' ? 'return=minimal' : 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `Supabase error ${res.status}`)
  return text ? JSON.parse(text) : null
}

// PATCH 결과가 빈 배열이면 그 id를 가진 행이 없다는 뜻 -> 404.
async function updateRow(env, table, id, body) {
  const rows = await supabase(env, 'PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, body)
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(404, 'not_found')
  return rows[0]
}

// 요청 body를 JSON으로 읽는다. 깨진 JSON이 오면 500(internal_error)이 아니라 400으로
// 답한다 — 서버 잘못이 아니라 요청이 잘못된 것이고, 500은 로그를 뒤지게 만든다.
async function readJsonBody(request) {
  try {
    const body = await request.json()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('not an object')
    }
    return body
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
}

// 클라이언트 body에서 허용된 컬럼만 뽑는다. id·created_at처럼 서버/DB가 정하는 값은
// 목록에 없으므로 body에 실려와도 무시된다 — 예전엔 { id, ...body } 순서 탓에 body의
// id가 서버가 만든 UUID를 덮어썼고, PATCH로는 기본키를 통째로 갈아치울 수도 있었다.
function pick(body, allowed) {
  const out = {}
  for (const key of allowed) {
    if (body != null && Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key]
  }
  return out
}

const EVENT_COLUMNS = [
  'title', 'category', 'start_date', 'end_date',
  'venue', 'venue_address', 'venue_lat', 'venue_lng',
  'organizer', 'description', 'poster_url',
  'ticket_url', 'ticket_open_date', 'ticket_open_time', 'ticket_open_note',
  'ticket_status', 'admission_fee', 'website', 'trust_score',
  'past_events', 'tags', 'crowd_level', 'floor_plan_url',
  'seoul_place_name', 'booth_info_note', 'stage_info_note',
]

const ID_RE = /^\/admin\/events\/([^/]+)$/

// 행사에 딸린 하위 목록(참가 부스, 출연진)은 구조가 같아서 라우트 패턴을 공유한다 —
// urlSegment(URL에 쓰는 이름) -> 실제 테이블명 + 허용 컬럼만 다르다.
const SUB_RESOURCES = {
  booths: { table: 'event_booths', columns: ['name', 'booth_no', 'goods', 'sort_order'] },
  performers: { table: 'event_performers', columns: ['artist_name', 'songs', 'sort_order'] },
}
const subResourcePattern = Object.keys(SUB_RESOURCES).join('|')
const SUB_OF_EVENT_RE = new RegExp(`^/admin/events/([^/]+)/(${subResourcePattern})$`)
const SUB_ID_RE = new RegExp(`^/admin/(${subResourcePattern})/([^/]+)$`)

async function handleAdmin(request, env, pathname) {
  // POST /admin/login — 로그인. 여기가 인증의 시작점이라 verifyAdmin 검사 이전에 처리한다.
  // 비밀번호 해시는 서버(env.ADMIN_PASSWORD_HASH)에만 있고 응답엔 절대 포함하지 않는다.
  if (pathname === '/admin/login' && request.method === 'POST') {
    const retryAfter = await loginLockedFor(request, env)
    if (retryAfter > 0) {
      return json({ error: 'too_many_attempts' }, env, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }

    const body = await readJsonBody(request).catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''
    const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH)
    if (!ok) {
      const globalFailures = await recordLoginFailure(request, env)
      await delay(
        globalFailures > LOGIN_GLOBAL_THROTTLE_AFTER
          ? LOGIN_GLOBAL_THROTTLE_MS
          : LOGIN_FAILURE_DELAY_MS
      )
      return json({ error: 'invalid_credentials' }, env, { status: 401 })
    }
    await clearLoginFailures(request, env)
    const token = await issueSessionToken(env)
    return json({ token }, env)
  }

  if (!await verifyAdmin(request, env)) {
    return json({ error: 'unauthorized' }, env, { status: 401 })
  }

  const idMatch = ID_RE.exec(pathname)
  const subOfEventMatch = SUB_OF_EVENT_RE.exec(pathname)
  const subIdMatch = SUB_ID_RE.exec(pathname)

  // POST /admin/events/:eventId/booths|performers — 하위 항목 추가
  if (subOfEventMatch && request.method === 'POST') {
    const eventId = decodeURIComponent(subOfEventMatch[1])
    const { table, columns } = SUB_RESOURCES[subOfEventMatch[2]]
    const body = await readJsonBody(request)
    const data = await supabase(env, 'POST', table, { ...pick(body, columns), event_id: eventId })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/booths|performers/:id — 하위 항목 수정
  if (subIdMatch && request.method === 'PATCH') {
    const { table, columns } = SUB_RESOURCES[subIdMatch[1]]
    const id = decodeURIComponent(subIdMatch[2])
    const body = await readJsonBody(request)
    await updateRow(env, table, id, pick(body, columns))
    return json({ ok: true }, env)
  }

  // DELETE /admin/booths|performers/:id — 하위 항목 삭제
  if (subIdMatch && request.method === 'DELETE') {
    const { table } = SUB_RESOURCES[subIdMatch[1]]
    const id = decodeURIComponent(subIdMatch[2])
    await supabase(env, 'DELETE', `${table}?id=eq.${encodeURIComponent(id)}`)
    return new Response(null, { status: 204, headers: corsHeaders(env) })
  }

  // POST /admin/events — 행사 추가
  if (pathname === '/admin/events' && request.method === 'POST') {
    const body = await readJsonBody(request)
    const data = await supabase(env, 'POST', 'events', {
      ...pick(body, EVENT_COLUMNS),
      id: crypto.randomUUID(),
    })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/events/:id — 행사 수정
  // admin_edited_at을 항상 서버에서 찍는다 — 이후 known-events.mjs 크롤러 동기화가
  // 이 행을 건너뛰게 해서, 관리자가 고친 값이 크롤러 값으로 덮어써지지 않게 막는다.
  if (idMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(idMatch[1])
    const body = await readJsonBody(request)
    await updateRow(env, 'events', id, {
      ...pick(body, EVENT_COLUMNS),
      admin_edited_at: new Date().toISOString(),
    })
    return json({ ok: true }, env)
  }

  // DELETE /admin/events/:id — 행사 삭제
  // event_drafts.promoted_event_id는 on delete set null이라 따로 정리할 필요가 없다
  // (supabase/hardening_2026-09-09.sql에서 FK 제약을 그렇게 바꿨다).
  if (idMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(idMatch[1])
    await supabase(env, 'DELETE', `events?id=eq.${encodeURIComponent(id)}`)
    return new Response(null, { status: 204, headers: corsHeaders(env) })
  }

  return json({ error: 'not_found' }, env, { status: 404 })
}

// 서울시 실시간 도시데이터 API 응답에서 우리가 쓰는 필드만 골라 반환한다.
// "서울시 주요 120장소"에 없는 장소명을 넘기면 ERROR-500이 오는데, 그것도
// 그대로 seoul_api_error로 넘겨서 프론트가 "지원 안 되는 장소" 처리하게 한다.
async function handleSeoulCongestion(request, env) {
  if (!env.SEOUL_OPENDATA_KEY) {
    return json({ error: 'not_configured' }, env, { status: 501 })
  }
  const place = new URL(request.url).searchParams.get('place')
  if (!place) return json({ error: 'missing_place' }, env, { status: 400 })

  const url = `http://openapi.seoul.go.kr:8088/${env.SEOUL_OPENDATA_KEY}/json/citydata/1/1/${encodeURIComponent(place)}`
  // 서울시 쪽은 캐시 헤더를 안 주기 때문에 cacheEverything을 명시해야 이 서브리퀘스트가
  // 엣지 캐시를 탄다. 이게 없으면 방문자 수만큼 그대로 원본을 때려서 일일 호출 한도를
  // 금방 태운다 (Worker 자기 응답의 Cache-Control은 브라우저/다운스트림용일 뿐이다).
  const res = await fetch(url, { cf: { cacheTtl: 120, cacheEverything: true } })
  const data = await res.json().catch(() => null)

  const resultCode = data?.['RESULT.CODE'] ?? data?.RESULT?.['RESULT.CODE']
  if (resultCode !== 'INFO-000') {
    return json(
      { error: 'seoul_api_error', message: data?.['RESULT.MESSAGE'] ?? data?.RESULT?.['RESULT.MESSAGE'] ?? '알 수 없는 오류' },
      env,
      { status: 502 }
    )
  }

  const ppltn = data.CITYDATA?.LIVE_PPLTN_STTS?.[0]
  if (!ppltn) return json({ error: 'no_data' }, env, { status: 502 })

  return json(
    {
      place: ppltn.AREA_NM,
      level: ppltn.AREA_CONGEST_LVL,
      message: ppltn.AREA_CONGEST_MSG,
      populationMin: Number(ppltn.AREA_PPLTN_MIN),
      populationMax: Number(ppltn.AREA_PPLTN_MAX),
      updatedAt: ppltn.PPLTN_TIME,
      forecast: (ppltn.FCST_PPLTN ?? []).slice(0, 4).map(f => ({
        time: f.FCST_TIME,
        level: f.FCST_CONGEST_LVL,
      })),
    },
    env,
    // 서울시 쪽 갱신 주기가 대략 5분이라, 그 사이 중복 호출은 캐시로 흡수한다
    // (여러 명이 동시에 같은 행사를 보고 있어도 서울시 API/키 호출량이 늘지 않게).
    { headers: { 'Cache-Control': 'public, max-age=120' } }
  )
}

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),

  '/seoul-congestion': handleSeoulCongestion,
}

export default {
  async fetch(request, env) {
    // ALLOWED_ORIGIN은 쉼표로 여러 origin을 담을 수 있다 — 요청의 Origin이 그중
    // 하나와 일치하면 그 값을 그대로 돌려주고(와일드카드 대신 정확히 매칭된 origin만
    // 허용), 아니면 목록의 첫 값으로 fallback한다. corsHeaders()는 이 값을 그대로
    // 읽기만 하면 되게, 여기서 한 번만 계산해서 env를 감싸 내려보낸다.
    const allowedOrigins = (env.ALLOWED_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const requestOrigin = request.headers.get('Origin')
    const resolvedOrigin = allowedOrigins.length === 0
      ? '*'
      : (allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0])
    env = { ...env, ALLOWED_ORIGIN: resolvedOrigin }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) })
    }

    const { pathname } = new URL(request.url)

    if (pathname.startsWith('/admin/')) {
      try {
        return await handleAdmin(request, env, pathname)
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.code }, env, { status: err.status })
        // Supabase 원문 에러엔 테이블/컬럼/제약 이름이 그대로 들어있다. 클라이언트엔
        // 마스킹해서 내보내고, 진짜 내용은 Worker 로그(observability)에만 남긴다.
        console.error('[admin]', request.method, pathname, err)
        return json({ error: 'internal_error' }, env, { status: 500 })
      }
    }

    const handler = routes[pathname]
    if (!handler) return json({ error: 'not_found' }, env, { status: 404 })

    try {
      return await handler(request, env)
    } catch (err) {
      console.error('[route]', pathname, err)
      return json({ error: 'internal_error' }, env, { status: 500 })
    }
  },
}
