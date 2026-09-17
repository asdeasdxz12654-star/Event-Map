// 로그인 없이 누구나 부르는 문들.
//
// 공통점: 인증이 없으므로 IP당 횟수로만 막는다. 그래서 브라우저가 Supabase를 직접
// 부르게 두지 않는다 — 그러면 속도 제한을 걸 자리가 아예 없다. 세 표 모두 RLS에
// 정책을 하나도 두지 않아 service_role(=이 Worker)만 통과한다.
import { HttpError, capText, json, readJsonBody, tooMany } from '../lib/http.js'
import { supabase } from '../lib/db.js'
import { rateExceeded } from '../lib/rate-limit.js'

// ── 제보 ───────────────────────────────────────────────────────────────────
const REPORT_RATE_LIMIT = 5                    // IP당 허용 건수
const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000   // 1시간
const REPORT_MESSAGE_MIN = 5
const REPORT_MESSAGE_MAX = 2000
const REPORT_CONTACT_MAX = 200
const REPORT_KINDS = ['correction', 'new_event']

// POST /reports  { kind, event_id?, message, contact? }
//
// 방문자가 "이 정보 틀렸어요" 또는 "이런 행사가 있어요"를 보내는 문.
export async function handleReportCreate(request, env) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')

  const retryAfter = await rateExceeded(request, env, {
    prefix: 'report', limit: REPORT_RATE_LIMIT, windowMs: REPORT_RATE_WINDOW_MS,
  })
  if (retryAfter > 0) return tooMany('too_many_reports', retryAfter, env)

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

  // 없는 행사 id로 신고하면 FK 위반이 난다. 그건 우리 잘못이 아니라 요청이 잘못된
  // 것이라 400으로 나가야 하는데, 그 변환은 이제 한 곳(lib/db.js asRequestError)에서
  // 한다 — 예전엔 여기서만 문자열로 코드를 훑고 있었고 관리자 쪽은 전부 500이었다.
  await supabase(env, 'POST', 'event_reports', {
    kind,
    event_id: eventId,
    message,
    contact: contact || null,
  })

  // 저장된 행을 돌려주지 않는다 — 보낸 사람에게 id를 알려줄 이유가 없고,
  // 그걸로 남의 제보를 넘겨짚을 수 있는 실마리를 만들 이유도 없다.
  return json({ ok: true }, env, { status: 201 })
}

// ── 방문자 화면에서 난 오류 ───────────────────────────────────────────────
// 오류 한 종류는 탭당 한 번만 올라오지만, 여러 탭·여러 화면에서 나면 그만큼 쌓인다.
// 제보(1시간 5건)보다 넉넉하게 두되 한 사람이 표를 덮지는 못하게 한다.
const CLIENT_ERROR_RATE_LIMIT = 30
const CLIENT_ERROR_RATE_WINDOW_MS = 60 * 60 * 1000
const CLIENT_ERROR_KINDS = ['boundary', 'error', 'unhandledrejection']
// 필드 길이. 브라우저 쪽에서도 자르지만(src/lib/errorReporter.js LIMITS) 그 코드를
// 안 거치고 직접 두드릴 수 있으니 여기서 다시 자른다.
const CAPS = { message: 500, stack: 4000, path: 200, user_agent: 300, app_build: 40, fingerprint: 64 }

// POST /client-errors  { fingerprint, message, stack?, kind, path?, user_agent?, app_build? }
//
// 같은 오류가 또 오면 새 줄을 만들지 않고 횟수만 올린다 — record_client_error()가
// 그 일을 한다. PostgREST의 on_conflict로는 "기존 값에 1을 더한다"를 쓸 수 없고,
// 읽고 더해서 쓰면 동시에 올라올 때 숫자가 어긋난다.
export async function handleClientError(request, env) {
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed')

  const retryAfter = await rateExceeded(request, env, {
    // 제보와 따로 센다. 한 사람이 오류를 많이 겪었다는 이유로 그 사람의 제보까지
    // 막히면 안 된다 — 둘은 서로 다른 일이다.
    prefix: 'clienterr', limit: CLIENT_ERROR_RATE_LIMIT, windowMs: CLIENT_ERROR_RATE_WINDOW_MS,
  })
  // 보낸 쪽은 이 응답을 읽지도 않는다(fire-and-forget). 그래도 429로 답해야
  // 중간의 캐시·프록시가 이걸 성공으로 착각하지 않는다.
  if (retryAfter > 0) return tooMany('too_many_errors', retryAfter, env)

  const body = await readJsonBody(request)
  const fingerprint = capText(body.fingerprint, CAPS.fingerprint)
  const message = capText(body.message, CAPS.message)
  // 이 둘이 없으면 줄을 묶을 수도, 무슨 고장인지 읽을 수도 없다.
  if (!fingerprint || !message) throw new HttpError(400, 'invalid_error_report')
  if (!CLIENT_ERROR_KINDS.includes(body.kind)) throw new HttpError(400, 'invalid_error_report')

  await supabase(env, 'POST', 'rpc/record_client_error', {
    p_fingerprint: fingerprint,
    p_message: message,
    p_stack: capText(body.stack, CAPS.stack),
    p_kind: body.kind,
    p_path: capText(body.path, CAPS.path),
    p_user_agent: capText(body.user_agent, CAPS.user_agent),
    p_app_build: capText(body.app_build, CAPS.app_build),
  })

  return json({ ok: true }, env, { status: 201 })
}

// ── 알림 끄기 ──────────────────────────────────────────────────────────────
// POST /push/unsubscribe  { token }
//
// 지금까지는 켜기만 되고 끄는 방법이 앱 안에 없었다 — 브라우저 권한을 직접 차단하는
// 수밖에 없었고, 그래도 서버의 토큰은 만료될 때까지 남아 계속 발송 대상이었다.
// 한 번 켜면 못 끄는 알림은 애초에 켜기 부담스럽다.
//
// 관리자 인증을 걸 수 없다(방문자가 하는 일이다). 대신 토큰 자체가 열쇠다 —
// 남의 구독을 지우려면 그 사람의 FCM 토큰(150자 안팎의 불투명한 값)을 알아야 하는데,
// 그건 발급받은 브라우저 말고는 알 수 없다. 켤 때(insert)와 같은 신뢰 모델이다.
//
// 토큰을 URL이 아니라 본문으로 받는다. 경로에 넣으면 액세스 로그·리퍼러에 남는다.
export async function handlePushUnsubscribe(request, env) {
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

export { CLIENT_ERROR_KINDS, CAPS as CLIENT_ERROR_CAPS, REPORT_KINDS }
