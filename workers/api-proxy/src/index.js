// event-map-api-proxy
//
// 프론트엔드(Cloudflare Pages)가 API 키를 노출하지 않고 외부 API를 호출하기 위한 중계 Worker.
// 지금은 아직 실제로 중계할 외부 API(교통 경로 등)가 정해지지 않아서 뼈대만 있는 상태.
//
// 새 프록시 엔드포인트 추가하는 법:
//   1. wrangler secret put <API_KEY 이름> 으로 키를 등록 (코드에 직접 쓰지 말 것)
//   2. 아래 routes 객체에 경로 추가, env.<API_KEY 이름> 으로 키를 읽어서 외부로 요청
//   3. 응답은 항상 corsHeaders(env)를 붙여서 반환
//
// CORS 설정:
//   wrangler secret put ALLOWED_ORIGIN 으로 프론트 도메인을 등록하면 해당 도메인만 허용.
//   미설정 시 개발 편의를 위해 '*' (전체 허용) — 프로덕션 배포 전 반드시 설정할 것.

function corsHeaders(env = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data, env, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(init.headers ?? {}) },
  })
}

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),

  // 예시: 실제 교통 API가 정해지면 이 자리에 구현. env.TRANSIT_API_KEY 처럼 secret으로 등록한 값을 읽어 쓴다.
  '/transit': (_request, env) =>
    json(
      { error: 'not_implemented', message: '교통 경로 API가 아직 연결되지 않았습니다' },
      env,
      { status: 501 }
    ),
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) })
    }

    const { pathname } = new URL(request.url)
    const handler = routes[pathname]
    if (!handler) return json({ error: 'not_found' }, env, { status: 404 })

    try {
      return await handler(request, env)
    } catch (err) {
      return json({ error: 'internal_error' }, env, { status: 500 })
    }
  },
}
