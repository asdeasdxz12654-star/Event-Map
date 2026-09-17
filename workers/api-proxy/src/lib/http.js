// HTTP 응답을 만드는 공통 조각.
//
// 왜 따로 빼나
//   예전엔 Worker가 index.js 한 파일 1118줄이었다. 그 안에 순수 함수가 여럿 있었지만
//   export가 `export default { fetch }` 하나뿐이라 밖에서 부를 수가 없었고, 그래서
//   검사를 하나도 못 붙였다. 프런트에는 135개가 있는데 가장 보안에 민감한 파일에는 0개.
//
//   나눈 기준은 "무엇을 다루는가"다 — 이 파일은 요청·응답의 겉모양만 다루고
//   DB도 인증도 모른다.

export class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

export function corsHeaders(env = {}) {
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

export function json(data, env, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(init.headers ?? {}) },
  })
}

// 429 응답 — 남은 초를 Retry-After로 함께 준다.
//
// 그냥 "나중에 다시"라고만 하면 언제 눌러야 할지 몰라 계속 눌러보게 된다. 세 군데
// (로그인·제보·오류보고)가 같은 모양을 쓰는데 각자 적어두면 한 곳만 고쳐지기 쉽다.
export function tooMany(code, retryAfterSec, env) {
  return json({ error: code }, env, {
    status: 429,
    headers: { 'Retry-After': String(retryAfterSec) },
  })
}

// 요청 body를 JSON으로 읽는다. 깨진 JSON이 오면 500(internal_error)이 아니라 400으로
// 답한다 — 서버 잘못이 아니라 요청이 잘못된 것이고, 500은 로그를 뒤지게 만든다.
export async function readJsonBody(request) {
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
export function pick(body, allowed) {
  const out = {}
  for (const key of allowed) {
    if (body != null && Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key]
  }
  return out
}

// 문자열을 다듬어 상한까지 자른다. 빈 값은 null이다.
//
// 막지 않고 자르는 이유: 길다는 이유로 400을 주면 진짜 오류 보고가 통째로 사라진다.
// 우리가 원하는 건 "안 받는 것"이 아니라 "앞부분이라도 받는 것"이다.
export function capText(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

// 요청 Origin을 허용 목록과 맞춰 하나로 정한다.
//
// ALLOWED_ORIGIN은 쉼표로 여러 개를 담을 수 있다 — 요청 Origin이 그중 하나와 일치하면
// 그 값을 그대로 돌려주고(와일드카드 대신 정확히 매칭된 origin만 허용), 아니면 목록의
// 첫 값으로 돌아간다. 목록이 비어 있으면 '*'다(설정 전 배포에서 기능이 죽지 않게).
export function resolveOrigin(env, requestOrigin) {
  const allowed = (env.ALLOWED_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (allowed.length === 0) return '*'
  return allowed.includes(requestOrigin) ? requestOrigin : allowed[0]
}
