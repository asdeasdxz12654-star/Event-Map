// event-map-api-proxy — 브라우저가 직접 부르면 안 되는 일을 대신 하는 Worker.
//
// 맡은 일은 셋이다.
//   1) 관리자 CRUD(/admin/*) — service_role 키로 Supabase를 부른다. 이 키가 브라우저
//      번들에 들어가면 RLS가 통째로 무의미해지므로 여기서만 쓴다.
//   2) 로그인 없는 방문자의 쓰기(/reports, /client-errors, /push/unsubscribe) —
//      브라우저가 Supabase를 직접 부르게 두면 속도 제한을 걸 자리가 없다.
//   3) 외부 API 대리 호출(/seoul-congestion) — 우리 인증키를 감춘다.
//
// 이 파일은 "어디로 보낼지"와 "실패를 어떤 상태 코드로 말할지"만 정한다. 실제 처리는
// routes/ 아래에, 공통 조각은 lib/ 아래에 있다.
//
// 시크릿(대시보드 또는 `npx wrangler secret put`):
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//   ADMIN_PASSWORD_HASH · SESSION_SECRET    — 관리자 로그인
//   SEOUL_OPENDATA_KEY                      — 선택, 실시간 혼잡도
//   ALLOWED_ORIGIN                          — 쉼표로 여러 개 가능
// KV 바인딩(권장): LOGIN_RATE_LIMIT — 로그인·제보·오류보고 카운터. wrangler.toml 참고.
import { HttpError, corsHeaders, json, resolveOrigin } from './lib/http.js'
import { asRequestError } from './lib/db.js'
import { handleAdmin } from './routes/admin.js'
import { handleSeoulCongestion } from './routes/seoul.js'
import { handleClientError, handlePushUnsubscribe, handleReportCreate } from './routes/public.js'

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),
  '/seoul-congestion': handleSeoulCongestion,
  '/push/unsubscribe': handlePushUnsubscribe,
  '/reports': handleReportCreate,
  '/client-errors': handleClientError,
}

// 실패를 응답으로 바꾼다. 세 갈래다.
//
//   HttpError            핸들러가 "이 코드로 답하고 끝내라"고 던진 것 — 그대로 내보낸다
//   DB 제약 위반          요청이 잘못된 것 — 400/409로 바꾼다
//   그 밖에               우리 잘못 — 500. 원문은 로그에만 남긴다
//
// 가운데 갈래가 예전엔 없었다. 관리자 화면에서 날짜를 잘못 넣거나 없는 행사에 부스를
// 붙이면 "서버 오류로 저장하지 못했습니다"가 떴다 — 자기 입력 실수인데 서버 탓으로
// 읽히고 고칠 실마리가 없다. 게다가 진짜 서버 오류가 같은 코드에 묻혀서 로그에서
// 구분이 안 됐다. 제보 쪽에만 있던 변환을 여기로 올려 전부에 적용한다.
//
// Supabase 원문 에러엔 테이블/컬럼/제약 이름이 그대로 들어 있어서 클라이언트에는
// 코드만 내보낸다(안내 문구는 src/lib/adminApi.js가 만든다).
function errorResponse(err, env, where) {
  if (err instanceof HttpError) return json({ error: err.code }, env, { status: err.status })

  const asRequest = asRequestError(err)
  if (asRequest) {
    // 400으로 나가는 것도 로그에는 남긴다 — 어떤 제약이 걸렸는지는 우리만 볼 수 있다.
    console.warn(where, err.dbCode, err.message)
    return json({ error: asRequest.code }, env, { status: asRequest.status })
  }

  console.error(where, err)
  return json({ error: 'internal_error' }, env, { status: 500 })
}

export default {
  async fetch(request, env) {
    // corsHeaders()가 그대로 읽기만 하면 되게, Origin 결정을 여기서 한 번만 한다.
    env = { ...env, ALLOWED_ORIGIN: resolveOrigin(env, request.headers.get('Origin')) }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) })
    }

    const { pathname } = new URL(request.url)

    try {
      if (pathname.startsWith('/admin/')) {
        return await handleAdmin(request, env, pathname)
      }
      const handler = routes[pathname]
      if (!handler) return json({ error: 'not_found' }, env, { status: 404 })
      return await handler(request, env)
    } catch (err) {
      return errorResponse(err, env, `[${request.method} ${pathname}]`)
    }
  },
}
