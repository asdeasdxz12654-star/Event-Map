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

// 방문자 제보 보호값. 로그인이 없으므로 IP당 횟수로만 막는다.
// 캡차는 넣지 않았다 — 지금 방문자가 얼마나 되는지도 모르는데 캡차부터 세우면
// 정상 제보의 문턱만 올린다. 실제로 스팸이 오면 그때 Turnstile을 얹는다.
const REPORT_RATE_LIMIT = 5              // IP당 허용 건수
const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000  // 1시간
const REPORT_MESSAGE_MIN = 5
const REPORT_MESSAGE_MAX = 2000
const REPORT_CONTACT_MAX = 200
const REPORT_KINDS = ['correction', 'new_event']
const REPORT_STATUSES = ['open', 'resolved', 'rejected']
// 검수 목록도 한 화면에서 훑는 용도라 상한을 둔다(drafts와 같은 이유).
const REPORT_LIMIT = 200

// 방문자 브라우저에서 난 오류.
const CLIENT_ERROR_KINDS = ['boundary', 'error', 'unhandledrejection']
const CLIENT_ERROR_STATUSES = ['open', 'resolved', 'ignored']
const CLIENT_ERROR_LIMIT = 200
// 필드 길이. 브라우저 쪽에서도 자르지만(src/lib/errorReporter.js LIMITS) 그 코드를
// 안 거치고 직접 두드릴 수 있으니 여기서 다시 자른다. 막지 않고 자르는 이유는,
// 길다는 이유로 400을 주면 진짜 오류 보고가 통째로 사라지기 때문이다.
const CLIENT_ERROR_CAPS = { message: 500, stack: 4000, path: 200, user_agent: 300, app_build: 40, fingerprint: 64 }
// 오류 한 종류는 탭당 한 번만 올라오지만, 여러 탭·여러 화면에서 나면 그만큼 쌓인다.
// 제보(1시간 5건)보다 넉넉하게 두되 한 사람이 표를 덮지는 못하게 한다.
const CLIENT_ERROR_RATE_LIMIT = 30
const CLIENT_ERROR_RATE_WINDOW_MS = 60 * 60 * 1000

// 자동 작업 실행 기록. 화면은 작업별 최근 몇 건만 보면 되는데, PostgREST로는
// "작업마다 최근 N건"을 한 번에 못 뽑는다(DISTINCT ON이 없다). 그래서 전체를
// 최신순으로 받아 브라우저에서 작업별로 나눈다 — 작업 7종 × 하루 1회면
// 200건이 3주치라, "며칠째 0건인가"를 세기에 넉넉하다.
const JOB_RUN_LIMIT = 200

// /seoul-congestion 보호 값. 이 라우트는 우리 인증키로 서울시 원본을 대신 호출하므로
// 인증 없는 공개 프록시가 되지 않게 두 겹으로 막는다(자세한 설명은 handleSeoulCongestion).
const SEOUL_PLACES_TTL_MS = 10 * 60 * 1000 // 허용 장소 목록 캐시 수명
const SEOUL_RATE_LIMIT = 60                // IP당 허용 요청 수
const SEOUL_RATE_WINDOW_MS = 10 * 60 * 1000

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

// ── 이미지 업로드 ─────────────────────────────────────────────────────────
// 관리자가 공지 캡처 같은 파일을 바로 올릴 수 있게 한다.
//
// 왜 필요한가
//   지금까지 이미지는 "주소를 붙여넣는" 방법뿐이었다. 그런데 실제로 필요한 사진은
//   공식 공지 안에 박혀 있는 경우가 많다 — 호요랜드 굿즈는 1200x42,500px짜리 세로
//   이미지 한 장, 젠레스는 1920x1080 슬라이드 9장이 전부다. 거기서 상품 부분을
//   잘라낸 파일에는 붙여넣을 주소가 없다. 어딘가에 먼저 올려야 했고, 그 단계가
//   사실상 입력을 막고 있었다.
//
// 크기 줄이기는 브라우저가 한다(ImageField의 canvas). Worker에는 이미지 처리
// 라이브러리가 없고, 줄여서 보내면 업로드 자체도 가벼워진다.
const UPLOAD_BUCKET = 'event-images'
// 브라우저가 webp로 줄여 보내므로 보통 1MB를 넘지 않는다. 배치도 원본을 그대로
// 올리는 경우를 감안해 여유를 두되, 버킷 상한(15MB)보다는 낮게 잡는다.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const UPLOAD_TYPES = ['image/webp', 'image/jpeg', 'image/png', 'image/gif']
// 저장 경로의 앞칸. 임의의 문자열을 받으면 ../로 버킷 밖을 가리킬 수 있다.
const UPLOAD_PREFIXES = ['items', 'booths', 'cosplayers', 'floor-plans', 'posters-manual']

async function uploadImage(request, env, url) {
  const prefix = url.searchParams.get('prefix') ?? 'items'
  if (!UPLOAD_PREFIXES.includes(prefix)) throw new HttpError(400, 'invalid_upload')

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!UPLOAD_TYPES.includes(contentType)) throw new HttpError(400, 'invalid_upload')

  // 크기는 본문을 읽기 "전에" 먼저 본다. arrayBuffer()는 통째로 메모리에 올리므로,
  // 읽고 나서 재면 이미 늦다 — 100MB짜리가 들어오면 그걸 다 담은 뒤에 413을 주게 되고
  // 그 전에 아이솔레이트 메모리 한도(128MB)에 먼저 부딪힌다.
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_UPLOAD_BYTES) throw new HttpError(413, 'file_too_large')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength === 0) throw new HttpError(400, 'invalid_upload')
  // Content-Length를 안 보내는 요청(청크 전송)도 있으므로 실제 크기로 한 번 더 막는다.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, 'file_too_large')

  // 파일 이름은 서버가 정한다. 클라이언트가 준 이름을 쓰면 경로 조작과 덮어쓰기를
  // 둘 다 열어주게 된다 — 같은 이름으로 올려 남의 이미지를 갈아치울 수 있다.
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.slice('image/'.length)
  const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  const path = `${prefix}/${name}`
  // 시크릿에 끝 슬래시가 붙어 있으면 ".../storage//..." 같은 주소가 만들어진다.
  // Storage는 그걸 다른 경로로 보기 때문에 올린 파일을 못 찾게 된다.
  const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '')

  const res = await fetch(`${base}/storage/v1/object/${UPLOAD_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'cache-control': 'max-age=31536000',
    },
    body: bytes,
  })
  if (!res.ok) {
    console.error('[upload]', res.status, await res.text().catch(() => ''))
    throw new HttpError(502, 'upload_failed')
  }

  return `${base}/storage/v1/object/public/${UPLOAD_BUCKET}/${path}`
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
// source_watches는 기본키가 id가 아니라 key다. 테이블마다 기본키 이름을 따로 두는 것보다
// 예외 하나를 여기 적어두는 편이 읽기 쉽다.
const PK = { source_watches: 'key' }

async function updateRow(env, table, id, body) {
  const pk = PK[table] ?? 'id'
  const rows = await supabase(env, 'PATCH', `${table}?${pk}=eq.${encodeURIComponent(id)}`, body)
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
  'seoul_place_name', 'booth_info_note', 'stage_info_note', 'floor_plan_note',
  'goods_info_note', 'cosplay_info_note',
]

// 검수 화면이 바꿀 수 있는 event_drafts 컬럼. 나머지(extracted·source_*·promoted_event_id)는
// 크롤러와 트리거가 정한다 — 관리자가 고칠 것은 "승인할지 말지"와 그 사유뿐이다.
const DRAFT_COLUMNS = ['status', 'review_note']
const DRAFT_STATUSES = ['pending', 'approved', 'rejected']
// 검수 목록은 한 화면에서 훑는 용도라 페이지네이션이 없다. PostgREST 기본 상한과
// 무관하게 여기서 끊어두면, 초안이 쌓여도 응답이 무한정 커지지 않는다.
const DRAFT_LIMIT = 200

// 화면에서 <a href>·<img src>로 그대로 나가는 컬럼들. 여기에 http(s)가 아닌 값이 들어가면
// 그 값이 곧 링크가 된다(javascript:, data: 등). DB에 들어가기 전에 막는 게 제일 싸다 —
// 저장되고 나면 프론트·미리보기 함수·ICS 내보내기까지 전부가 그 값을 쓰게 된다.
const URL_COLUMNS = ['poster_url', 'ticket_url', 'website', 'floor_plan_url', 'image_url',
  'photo_url', 'sns_url']

function isHttpUrl(value) {
  if (typeof value !== 'string' || value === '') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// 값이 비어 있으면(null·빈 문자열) "지우기"라 그대로 통과시킨다. 값이 있는데 http(s)가
// 아니면 400으로 거절한다 — 조용히 버리면 관리자는 저장된 줄 알고 화면을 떠난다.
function assertUrlColumns(data) {
  for (const key of URL_COLUMNS) {
    const value = data[key]
    if (value == null || value === '') continue
    if (!isHttpUrl(value)) throw new HttpError(400, 'invalid_url')
  }
  return data
}

const ID_RE = /^\/admin\/events\/([^/]+)$/

// 행사에 딸린 하위 목록(참가 부스, 출연진)은 구조가 같아서 라우트 패턴을 공유한다 —
// urlSegment(URL에 쓰는 이름) -> 실제 테이블명 + 허용 컬럼만 다르다.
const SUB_RESOURCES = {
  booths: {
    table: 'event_booths',
    columns: ['name', 'booth_no', 'goods', 'image_url', 'sort_order', 'operator', 'hall', 'genre'],
  },
  performers: { table: 'event_performers', columns: ['artist_name', 'songs', 'sort_order'] },
  // 무대는 장소(stages)와 시간표(stage_slots)로 나뉜다 — 한 행사에 무대가 여럿일 수 있고
  // (지스타는 기업 부스마다 자체 무대가 있다), 같은 프로그램이 여러 날 반복되기 때문이다.
  stages: { table: 'event_stages', columns: ['name', 'booth_id', 'location', 'sort_order'] },
  stage_slots: {
    table: 'event_stage_slots',
    columns: ['stage_id', 'day', 'start_time', 'end_time', 'title', 'performer', 'note', 'kind', 'sort_order'],
  },
  cosplayers: {
    table: 'event_cosplayers',
    columns: ['name', 'booth_id', 'character', 'title', 'photo_url', 'sns_url',
      'day', 'start_time', 'end_time', 'note', 'sort_order'],
  },
  // 부스 안의 개별 항목(웰컴 키트·체험·굿즈 등). booth_id를 body로 받는 대신 event_id는
  // 다른 하위 리소스와 똑같이 URL에서 서버가 넣는다 — 클라이언트가 남의 행사 id를
  // 지정할 수 없고, 라우트 코드도 그대로 재사용된다.
  booth_items: {
    table: 'event_booth_items',
    columns: ['booth_id', 'kind', 'name', 'price', 'price_note', 'note', 'image_url',
      'sort_order', 'title', 'status'],
  },
  // 상세페이지 탭의 이름·순서·표시 여부와, 직접 만든 탭의 본문.
  // 행이 없으면 화면은 예전처럼 동작한다 — 이 표의 행은 기본 동작을 덮어쓰는 예외다.
  tabs: {
    table: 'event_tabs',
    columns: ['key', 'builtin', 'label', 'body', 'visible', 'sort_order'],
  },
}
const subResourcePattern = Object.keys(SUB_RESOURCES).join('|')
const SUB_OF_EVENT_RE = new RegExp(`^/admin/events/([^/]+)/(${subResourcePattern})$`)
const SUB_ID_RE = new RegExp(`^/admin/(${subResourcePattern})/([^/]+)$`)

async function handleAdmin(request, env, pathname) {
  // POST /admin/login — 로그인. 여기가 인증의 시작점이라 verifyAdmin 검사 이전에 처리한다.
  // 비밀번호 해시는 서버(env.ADMIN_PASSWORD_HASH)에만 있고 응답엔 절대 포함하지 않는다.
  if (pathname === '/admin/login' && request.method === 'POST') {
    // 시크릿이 안 붙은 배포는 로그인을 아예 막는다. 예전엔 SESSION_SECRET이 없어도 로그인이
    // "성공"하면서 토큰을 내줬는데(서명 키가 문자열 "undefined"가 된다) verifySessionToken은
    // 그 상태에서 무조건 false를 돌려주니, 관리자는 "로그인은 되는데 이후 요청이 전부 401"인
    // 원인 모를 상태에 빠졌다. 설정 누락은 설정 누락이라고 말해주는 편이 낫다.
    if (!env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) {
      console.error('[admin] ADMIN_PASSWORD_HASH 또는 SESSION_SECRET 시크릿이 등록되지 않았습니다')
      return json({ error: 'not_configured' }, env, { status: 501 })
    }

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

  // POST /admin/uploads?prefix=items — 이미지 파일 업로드 (본문이 JSON이 아니라 바이트다)
  if (pathname === '/admin/uploads' && request.method === 'POST') {
    const publicUrl = await uploadImage(request, env, new URL(request.url))
    return json({ url: publicUrl }, env, { status: 201 })
  }

  // POST /admin/watches/:key/ack — 감지 알림을 확인 처리한다.
  // 값을 바꾸는 게 아니라 "봤다"를 기록하는 것이라 body가 없다.
  const ackMatch = /^\/admin\/watches\/([^/]+)\/ack$/.exec(pathname)
  if (ackMatch && request.method === 'POST') {
    await updateRow(env, 'source_watches', decodeURIComponent(ackMatch[1]), {
      acknowledged_at: new Date().toISOString(),
    })
    return json({ ok: true }, env)
  }

  // ── event_drafts ──────────────────────────────────────────────────────────
  // 검수 화면이 쓰던 경로다. 예전엔 브라우저가 Supabase를 직접 부르고 RLS가
  // "auth.jwt()->>'email'이 관리자 이메일인가"로 막았는데, 그러려면 구글 로그인이
  // 따로 필요했다 — 나머지 관리 기능은 전부 이 Worker의 관리자 코드를 쓰는데
  // 검수 화면 하나만 로그인이 달라서, 한쪽만 로그인된 상태에서는 목록이 조용히
  // 비어 보였다(RLS는 에러가 아니라 빈 배열을 준다). 여기로 옮겨 하나로 합친다.

  // GET /admin/drafts?status=pending — 이 Worker의 첫 조회 엔드포인트다.
  if (pathname === '/admin/drafts' && request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    // status는 그대로 쿼리에 들어가므로 아는 값만 통과시킨다.
    if (!DRAFT_STATUSES.includes(status)) throw new HttpError(400, 'invalid_status')
    const rows = await supabase(
      env,
      'GET',
      `event_drafts?status=eq.${status}&order=created_at.desc&limit=${DRAFT_LIMIT}`
    )
    return json(rows ?? [], env)
  }

  // PATCH /admin/drafts/:id — 승인/반려.
  //
  // 승인하면 promote_event_draft() 트리거가 events에 행을 만든다. 실패하면 트리거가
  // 그 draft만 rejected로 돌리고 review_note에 사유를 적으므로, 여기서는 200으로
  // 끝나도 status가 rejected일 수 있다 — 바뀐 행을 통째로 돌려줘서 호출부가 그걸
  // 보고 판단하게 한다. ({ok:true}만 주면 "승인했는데 왜 반려됨?"을 알 길이 없다.)
  const draftMatch = /^\/admin\/drafts\/([^/]+)$/.exec(pathname)
  if (draftMatch && request.method === 'PATCH') {
    const body = await readJsonBody(request)
    const patch = pick(body, DRAFT_COLUMNS)
    if (patch.status != null && !DRAFT_STATUSES.includes(patch.status)) {
      throw new HttpError(400, 'invalid_status')
    }
    const row = await updateRow(env, 'event_drafts', decodeURIComponent(draftMatch[1]), patch)
    return json(row, env)
  }

  // ── event_reports (방문자 제보) ────────────────────────────────────────────
  // 넣는 문은 /reports(공개)이고, 여기는 읽고 처리하는 쪽이다.
  // 제보에는 연락처가 들어 있어서 공개 읽기를 열지 않았다 — 이 경로로만 볼 수 있다.

  // GET /admin/reports?status=open — 대상 행사 제목을 함께 가져온다.
  // 제보만 봐서는 어느 행사 얘기인지 id밖에 안 보인다.
  if (pathname === '/admin/reports' && request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') ?? 'open'
    if (!REPORT_STATUSES.includes(status)) throw new HttpError(400, 'invalid_status')
    const rows = await supabase(
      env,
      'GET',
      `event_reports?status=eq.${status}&select=*,events(title,start_date)` +
      `&order=created_at.desc&limit=${REPORT_LIMIT}`
    )
    return json(rows ?? [], env)
  }

  // PATCH /admin/reports/:id — 처리 완료/반려 + 메모.
  const reportMatch = /^\/admin\/reports\/([^/]+)$/.exec(pathname)
  if (reportMatch && request.method === 'PATCH') {
    const body = await readJsonBody(request)
    const patch = pick(body, ['status', 'admin_note'])
    if (patch.status != null && !REPORT_STATUSES.includes(patch.status)) {
      throw new HttpError(400, 'invalid_status')
    }
    // 처리 시각은 서버가 찍는다 — 클라이언트 시계를 믿을 이유가 없다.
    if (patch.status && patch.status !== 'open') patch.reviewed_at = new Date().toISOString()
    const row = await updateRow(env, 'event_reports', decodeURIComponent(reportMatch[1]), patch)
    return json(row, env)
  }

  // ── client_errors (방문자 화면에서 난 오류) ────────────────────────────────
  // 넣는 문은 /client-errors(공개)이고, 여기는 읽고 처리하는 쪽이다.
  // stack에 우리 코드 구조가, user_agent에 방문자 정보가 들어 있어 공개하지 않는다.
  if (pathname === '/admin/client-errors' && request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') ?? 'open'
    if (!CLIENT_ERROR_STATUSES.includes(status)) throw new HttpError(400, 'invalid_status')
    const rows = await supabase(
      env,
      'GET',
      `client_errors?status=eq.${status}&order=last_seen_at.desc&limit=${CLIENT_ERROR_LIMIT}`
    )
    return json(rows ?? [], env)
  }

  // PATCH /admin/client-errors/:id — 처리함 / 무시.
  const clientErrorMatch = /^\/admin\/client-errors\/([^/]+)$/.exec(pathname)
  if (clientErrorMatch && request.method === 'PATCH') {
    const body = await readJsonBody(request)
    const patch = pick(body, ['status', 'admin_note'])
    if (patch.status != null && !CLIENT_ERROR_STATUSES.includes(patch.status)) {
      throw new HttpError(400, 'invalid_status')
    }
    const row = await updateRow(env, 'client_errors', decodeURIComponent(clientErrorMatch[1]), patch)
    return json(row, env)
  }

  // ── job_runs (자동 작업 실행 기록) ─────────────────────────────────────────
  // GET /admin/job-runs — 대시보드가 "크롤러 마지막 실행 3일 전"을 말하기 위해 읽는다.
  //
  // 공개 읽기를 열지 않고 여기로 온 이유: error 컬럼에 외부 API 응답이 그대로 들어올
  // 수 있고, 그 안에 요청 URL이 섞이면 키가 딸려 온다. 쓰는 쪽에서 한 번 지우지만
  // (shared/job-run.mjs redactSecrets) 그 규칙이 완벽하다고 가정하지 않는다.
  if (pathname === '/admin/job-runs' && request.method === 'GET') {
    const rows = await supabase(
      env,
      'GET',
      `job_runs?order=started_at.desc&limit=${JOB_RUN_LIMIT}`
    )
    return json(rows ?? [], env)
  }

  const idMatch = ID_RE.exec(pathname)
  const subOfEventMatch = SUB_OF_EVENT_RE.exec(pathname)
  const subIdMatch = SUB_ID_RE.exec(pathname)

  // POST /admin/events/:eventId/booths|performers — 하위 항목 추가
  if (subOfEventMatch && request.method === 'POST') {
    const eventId = decodeURIComponent(subOfEventMatch[1])
    const { table, columns } = SUB_RESOURCES[subOfEventMatch[2]]
    const body = await readJsonBody(request)
    const data = await supabase(env, 'POST', table, {
      ...assertUrlColumns(pick(body, columns)),
      event_id: eventId,
    })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/booths|performers/:id — 하위 항목 수정
  if (subIdMatch && request.method === 'PATCH') {
    const { table, columns } = SUB_RESOURCES[subIdMatch[1]]
    const id = decodeURIComponent(subIdMatch[2])
    const body = await readJsonBody(request)
    await updateRow(env, table, id, assertUrlColumns(pick(body, columns)))
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
      ...assertUrlColumns(pick(body, EVENT_COLUMNS)),
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
      ...assertUrlColumns(pick(body, EVENT_COLUMNS)),
      admin_edited_at: new Date().toISOString(),
    })
    return json({ ok: true }, env)
  }

  // POST /admin/events/:id/unlock — 크롤러 자동 갱신을 다시 켠다.
  //
  // 위 PATCH가 admin_edited_at을 찍고 나면 크롤러 13곳이 그 행을 건너뛴다
  // (known-events.mjs 등에서 .is('admin_edited_at', null)). 제목 오타 하나를 고쳐도
  // 그 행사는 이후 공식 포스터·예매 링크가 발표돼도 영영 자동으로 안 채워진다.
  // 지금까지 이 값을 되돌릴 방법이 아예 없었다 — 그래서 되돌리는 문을 하나 낸다.
  //
  // PATCH의 한 필드로 두지 않는 이유: PATCH는 무조건 admin_edited_at을 찍으므로
  // 같은 요청 안에서 켜고 끄는 게 서로 어긋난다. 별도 동작으로 두는 편이 분명하다.
  const unlockMatch = /^\/admin\/events\/([^/]+)\/unlock$/.exec(pathname)
  if (unlockMatch && request.method === 'POST') {
    await updateRow(env, 'events', decodeURIComponent(unlockMatch[1]), { admin_edited_at: null })
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

// --- 서울시 실시간 도시데이터 ---------------------------------------------
// 이 라우트는 우리 인증키(SEOUL_OPENDATA_KEY)로 서울시 원본을 대신 호출한다. CORS는
// 브라우저만 막지 curl은 못 막으므로, 그냥 두면 누구나 쓸 수 있는 공개 프록시다.
// 특히 place가 그대로 URL에 들어가는데 엣지 캐시의 키가 URL이라, 매번 다른 문자열을
// 넣으면 캐시를 통째로 우회해 요청 수만큼 원본을 때릴 수 있었다(= 일일 호출 한도를
// 스크립트 한 줄로 소진). 두 겹으로 막는다.
//   1) 장소 화이트리스트 — events.seoul_place_name에 실제로 들어 있는 이름만 허용.
//   2) IP당 요청 수 제한 — 허용된 장소만 골라 돌려도 원본 호출이 늘지 않게.
let seoulPlaces = { names: null, fetchedAt: 0 }

async function allowedSeoulPlaces(env) {
  const now = Date.now()
  if (seoulPlaces.names && now - seoulPlaces.fetchedAt < SEOUL_PLACES_TTL_MS) return seoulPlaces.names
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return seoulPlaces.names
  try {
    const rows = await supabase(env, 'GET', 'events?select=seoul_place_name&seoul_place_name=not.is.null')
    const names = new Set((rows ?? []).map(row => row.seoul_place_name).filter(Boolean))
    // 조회에 성공했으면 결과가 비어 있어도 그게 답이다 — seoul_place_name을 쓰는 행사가
    // 하나도 없으면 어떤 place도 정당하지 않으므로 전부 거절해야 한다.
    // (처음엔 "0건이면 목록 없음"으로 뒀는데, 실제로 이 컬럼을 쓰는 행사가 하나도 없어서
    //  배포하자마자 모든 요청이 검사를 그냥 통과했다 — 잠그려던 구멍이 그대로 열려 있었다.)
    seoulPlaces = { names, fetchedAt: now }
    return names
  } catch (err) {
    // 여기는 "모른다"라서 다르다. 조회 자체가 실패한 것이므로 기능을 죽이지 않고
    // 마지막으로 성공한 목록을 계속 쓰고, 그것도 없으면 아래 레이트리밋만으로 버틴다.
    console.error('[seoul] 허용 장소 목록 조회 실패', err)
    return seoulPlaces.names
  }
}

// 카운터를 KV가 아니라 아이솔레이트 메모리에 둔다 — 무료 플랜 KV는 하루 쓰기 1,000회라,
// 요청마다 쓰는 공개 라우트에 붙이면 로그인 잠금용 카운터까지 같이 말라버린다.
// 콜로마다 따로 세지만, 목적("한 명이 스크립트로 원본을 두들기는 것" 차단)에는 충분하다.
const seoulHits = new Map()

// 초과했으면 남은 초, 아니면 0.
function seoulRateExceeded(request) {
  const ip = clientIp(request)
  const now = Date.now()
  const entry = seoulHits.get(ip)
  if (!entry || entry.resetAt <= now) {
    seoulHits.set(ip, { count: 1, resetAt: now + SEOUL_RATE_WINDOW_MS })
    if (seoulHits.size > 5000) {
      for (const [key, value] of seoulHits) if (value.resetAt <= now) seoulHits.delete(key)
    }
    return 0
  }
  entry.count += 1
  return entry.count > SEOUL_RATE_LIMIT ? Math.ceil((entry.resetAt - now) / 1000) : 0
}

// https로 먼저 부른다 — http면 인증키가 URL 경로에 평문으로 실려 나가고 중간 구간·원본
// 접근 로그에 그대로 남는다. 다만 서울시 쪽 8088 포트의 TLS 지원이 확실치 않아, 연결
// 자체가 실패하면 http로 한 번 더 간다(기능을 죽이지 않되 가능하면 평문을 피한다).
// 로그에 아래 경고가 찍히면 https가 안 되는 것이니 그때는 키 주기적 교체로 대응한다.
async function fetchSeoulCityData(key, place) {
  const path = `:8088/${key}/json/citydata/1/1/${encodeURIComponent(place)}`
  // 서울시 쪽은 캐시 헤더를 안 주기 때문에 cacheEverything을 명시해야 이 서브리퀘스트가
  // 엣지 캐시를 탄다. 이게 없으면 방문자 수만큼 그대로 원본을 때려서 일일 호출 한도를
  // 금방 태운다 (Worker 자기 응답의 Cache-Control은 브라우저/다운스트림용일 뿐이다).
  const cf = { cacheTtl: 120, cacheEverything: true }
  try {
    return await fetch(`https://openapi.seoul.go.kr${path}`, { cf })
  } catch (err) {
    console.warn('[seoul] https 호출 실패 — http로 폴백(인증키가 평문으로 나감)', err)
    return fetch(`http://openapi.seoul.go.kr${path}`, { cf })
  }
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

  // 프론트(LiveCongestion)는 error가 오면 이 위젯을 그리지 않으므로, 아래 두 거절은
  // 정상 사용자 화면에서는 아무 변화도 만들지 않는다.
  const allowed = await allowedSeoulPlaces(env)
  if (allowed && !allowed.has(place)) {
    return json({ error: 'unsupported_place' }, env, { status: 400 })
  }

  const retryAfter = seoulRateExceeded(request)
  if (retryAfter > 0) {
    return json({ error: 'rate_limited' }, env, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }

  const res = await fetchSeoulCityData(env.SEOUL_OPENDATA_KEY, place)
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

// POST /push/unsubscribe  { token }
//
// 알림을 끄는 문. 지금까지는 켜기만 되고 끄는 방법이 앱 안에 없었다 —
// 브라우저 권한을 직접 차단하는 수밖에 없었고, 그래도 서버의 토큰은 만료될 때까지 남아
// 계속 발송 대상이었다. 한 번 켜면 못 끄는 알림은 애초에 켜기 부담스럽다.
//
// 관리자 인증을 걸 수 없다(방문자가 하는 일이다). 대신 토큰 자체가 열쇠다 —
// 남의 구독을 지우려면 그 사람의 FCM 토큰(150자 안팎의 불투명한 값)을 알아야 하는데,
// 그건 발급받은 브라우저 말고는 알 수 없다. 켤 때(insert)와 같은 신뢰 모델이다.
//
// 토큰을 URL이 아니라 본문으로 받는다. 경로에 넣으면 액세스 로그·리퍼러에 남는다.
async function handlePushUnsubscribe(request, env) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  const body = await readJsonBody(request)
  const token = body.token

  // DB의 insert 정책과 같은 길이 조건. 형식이 아닌 값은 애초에 우리 토큰일 수 없다.
  if (typeof token !== 'string' || token.length < 100 || token.length > 300) {
    throw new HttpError(400, 'invalid_token')
  }

  await supabase(env, 'DELETE', `push_subscriptions?token=eq.${encodeURIComponent(token)}`)
  // 없는 토큰을 지워도 성공으로 답한다 — "그 토큰이 등록돼 있었는지"를 알려주면
  // 이 엔드포인트가 토큰 존재 여부를 확인하는 도구가 된다.
  return json({ ok: true }, env)
}

// 제보 횟수 세기. 로그인 레이트리밋과 같은 저장소를 쓴다(counterStore) —
// KV가 붙어 있으면 KV, 없으면 아이솔레이트 메모리.
//
// 처음엔 메모리 Map만 썼는데 실제로 재보니 안 걸렸다. Cloudflare는 요청을 여러
// 아이솔레이트·콜로로 흩뿌리고 배포할 때마다 새로 뜨기 때문에, 메모리 카운터는
// "1시간에 5건"이 아니라 "아이솔레이트마다 5건"이 된다. 로그인 쪽이 이미 KV를
// 쓰고 있으므로 같은 것을 쓴다 — 바인딩 이름이 LOGIN_RATE_LIMIT이지만 용도는 카운터다.
//
// 초과했으면 남은 초, 아니면 0.
// 넘었으면 남은 초(Retry-After), 아니면 0. 창이 지나면 0부터 다시 센다.
async function rateExceeded(request, env, { prefix, limit, windowMs }) {
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

function reportRateExceeded(request, env) {
  return rateExceeded(request, env, {
    prefix: 'report', limit: REPORT_RATE_LIMIT, windowMs: REPORT_RATE_WINDOW_MS,
  })
}

// 오류 보고는 제보와 따로 센다. 한 사람이 오류를 많이 겪었다는 이유로 그 사람의
// 제보까지 막히면 안 된다 — 둘은 서로 다른 일이다.
function clientErrorRateExceeded(request, env) {
  return rateExceeded(request, env, {
    prefix: 'clienterr', limit: CLIENT_ERROR_RATE_LIMIT, windowMs: CLIENT_ERROR_RATE_WINDOW_MS,
  })
}

// POST /client-errors  { fingerprint, message, stack?, kind, path?, user_agent?, app_build? }
//
// 방문자 화면에서 난 오류가 들어오는 문. 지금까지 이런 고장은 그 사람 브라우저
// 콘솔에만 남고 우리는 영영 몰랐다.
//
// 같은 오류가 또 오면 새 줄을 만들지 않고 횟수만 올린다 — record_client_error()가
// 그 일을 한다. PostgREST의 on_conflict로는 "기존 값에 1을 더한다"를 쓸 수 없고,
// 읽고 더해서 쓰면 동시에 올라올 때 숫자가 어긋난다.
async function handleClientError(request, env) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')

  const retryAfter = await clientErrorRateExceeded(request, env)
  if (retryAfter > 0) {
    // 보낸 쪽은 이 응답을 읽지도 않는다(fire-and-forget). 그래도 429로 답해야
    // 중간의 캐시·프록시가 이걸 성공으로 착각하지 않는다.
    return json({ error: 'too_many_errors' }, env, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }

  const body = await readJsonBody(request)

  // 길이는 막지 않고 자른다. 길다는 이유로 400을 주면 진짜 오류 보고가 통째로 사라진다.
  const cap = (value, max) => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text ? text.slice(0, max) : null
  }

  const fingerprint = cap(body.fingerprint, CLIENT_ERROR_CAPS.fingerprint)
  const message = cap(body.message, CLIENT_ERROR_CAPS.message)
  // 이 둘이 없으면 줄을 묶을 수도, 무슨 고장인지 읽을 수도 없다.
  if (!fingerprint || !message) throw new HttpError(400, 'invalid_error_report')
  if (!CLIENT_ERROR_KINDS.includes(body.kind)) throw new HttpError(400, 'invalid_error_report')

  await supabase(env, 'POST', 'rpc/record_client_error', {
    p_fingerprint: fingerprint,
    p_message: message,
    p_stack: cap(body.stack, CLIENT_ERROR_CAPS.stack),
    p_kind: body.kind,
    p_path: cap(body.path, CLIENT_ERROR_CAPS.path),
    p_user_agent: cap(body.user_agent, CLIENT_ERROR_CAPS.user_agent),
    p_app_build: cap(body.app_build, CLIENT_ERROR_CAPS.app_build),
  })

  return json({ ok: true }, env, { status: 201 })
}

// POST /reports  { kind, event_id?, message, contact? }
//
// 방문자가 "이 정보 틀렸어요" 또는 "이런 행사가 있어요"를 보내는 문.
// 로그인이 없으므로 누구나 보낼 수 있고, 그래서 IP당 횟수로만 막는다.
//
// 브라우저가 Supabase에 직접 넣게 하지 않는 이유: 그러면 속도 제한을 걸 자리가 없다.
// event_reports의 RLS는 정책을 하나도 두지 않아 service_role만 통과한다.
async function handleReportCreate(request, env) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')

  const retryAfter = await reportRateExceeded(request, env)
  if (retryAfter > 0) {
    return json({ error: 'too_many_reports' }, env, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }

  const body = await readJsonBody(request)
  const kind = body.kind
  if (!REPORT_KINDS.includes(kind)) throw new HttpError(400, 'invalid_report')

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (message.length < REPORT_MESSAGE_MIN || message.length > REPORT_MESSAGE_MAX) {
    throw new HttpError(400, 'invalid_message')
  }

  const contact = typeof body.contact === 'string' ? body.contact.trim() : ''
  if (contact.length > REPORT_CONTACT_MAX) throw new HttpError(400, 'invalid_contact')

  // correction은 대상 행사가 있어야 하고, new_event는 없어야 한다(DB check와 같은 규칙).
  const eventId = typeof body.event_id === 'string' && body.event_id ? body.event_id : null
  if (kind === 'correction' && !eventId) throw new HttpError(400, 'invalid_report')
  if (kind === 'new_event' && eventId) throw new HttpError(400, 'invalid_report')

  try {
    await supabase(env, 'POST', 'event_reports', {
      kind,
      event_id: eventId,
      message,
      contact: contact || null,
    })
  } catch (err) {
    // 없는 행사 id로 신고하면 FK 위반(23503)이 난다. 그건 우리 잘못이 아니라 요청이
    // 잘못된 것이라 400으로 답한다 — 500으로 두면 "서버가 고장났다"로 읽히고,
    // 그 사이 진짜 서버 오류가 같은 코드에 묻힌다.
    // (check 제약 위반 23514도 같다 — 길이·조합 규칙을 DB가 한 번 더 보는 자리다.)
    const text = String(err?.message ?? '')
    if (text.includes('23503') || text.includes('23514')) {
      throw new HttpError(400, 'invalid_report')
    }
    throw err
  }

  // 저장된 행을 돌려주지 않는다 — 보낸 사람에게 id를 알려줄 이유가 없고,
  // 그걸로 남의 제보를 넘겨짚을 수 있는 실마리를 만들 이유도 없다.
  return json({ ok: true }, env, { status: 201 })
}

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),

  '/seoul-congestion': handleSeoulCongestion,

  '/push/unsubscribe': handlePushUnsubscribe,

  '/reports': handleReportCreate,

  '/client-errors': handleClientError,
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
      // /admin/* 쪽과 같은 처리. 예전엔 여기서 HttpError를 안 봐서, 잘못된 요청까지
      // 전부 500으로 나갔다 — 호출부는 "서버가 고장났나?"와 "내가 잘못 보냈나?"를
      // 구분할 수 없고, 로그에는 우리 잘못이 아닌 것이 서버 오류로 쌓인다.
      if (err instanceof HttpError) return json({ error: err.code }, env, { status: err.status })
      console.error('[route]', pathname, err)
      return json({ error: 'internal_error' }, env, { status: 500 })
    }
  },
}
