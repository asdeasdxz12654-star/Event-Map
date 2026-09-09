// event-map-api-proxy
//
// 프론트엔드(GitHub Pages)가 API 키를 노출하지 않고 외부 API를 호출하기 위한 중계 Worker.
// 관리자 CRUD 엔드포인트(/admin/events)는 ADMIN_TOKEN_HASH 시크릿으로 검증 후
// SUPABASE_SERVICE_ROLE_KEY를 사용해 DB에 직접 쓴다.
//
// 시크릿 등록:
//   npx wrangler secret put SUPABASE_URL
//   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
//   npx wrangler secret put ADMIN_TOKEN_HASH   (값: sha256(관리자 비밀번호의 sha256) — AdminContext.jsx의
//                                                _d()로 만든 토큰을 다시 sha256한 값. 실제 값은 커밋하지
//                                                말고 각자 로컬에서만 계산해 등록할 것)
//   npx wrangler secret put ALLOWED_ORIGIN     (값: 프론트엔드 도메인, ex: https://<user>.github.io)

function corsHeaders(env = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function json(data, env, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(init.headers ?? {}) },
  })
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyAdmin(request, env) {
  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  if (!token || !env.ADMIN_TOKEN_HASH) return false
  const tokenHash = await sha256hex(token)
  return tokenHash === env.ADMIN_TOKEN_HASH
}

async function supabase(env, method, path, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `Supabase error ${res.status}`)
  return text ? JSON.parse(text) : null
}

const ID_RE = /^\/admin\/events\/([^/]+)$/
const BOOTHS_OF_EVENT_RE = /^\/admin\/events\/([^/]+)\/booths$/
const BOOTH_ID_RE = /^\/admin\/booths\/([^/]+)$/

async function handleAdmin(request, env, pathname) {
  if (!await verifyAdmin(request, env)) {
    return json({ error: 'unauthorized' }, env, { status: 401 })
  }

  const idMatch = ID_RE.exec(pathname)
  const boothsOfEventMatch = BOOTHS_OF_EVENT_RE.exec(pathname)
  const boothIdMatch = BOOTH_ID_RE.exec(pathname)

  // POST /admin/events/:eventId/booths — 참가 부스 추가
  if (boothsOfEventMatch && request.method === 'POST') {
    const eventId = decodeURIComponent(boothsOfEventMatch[1])
    const body = await request.json()
    const data = await supabase(env, 'POST', 'event_booths', { event_id: eventId, ...body })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/booths/:id — 참가 부스 수정
  if (boothIdMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(boothIdMatch[1])
    const body = await request.json()
    await supabase(env, 'PATCH', `event_booths?id=eq.${encodeURIComponent(id)}`, body)
    return json({ ok: true }, env)
  }

  // DELETE /admin/booths/:id — 참가 부스 삭제
  if (boothIdMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(boothIdMatch[1])
    await supabase(env, 'DELETE', `event_booths?id=eq.${encodeURIComponent(id)}`)
    return new Response(null, { status: 204, headers: corsHeaders(env) })
  }

  // POST /admin/events — 행사 추가
  if (pathname === '/admin/events' && request.method === 'POST') {
    const body = await request.json()
    const id = crypto.randomUUID()
    const data = await supabase(env, 'POST', 'events', { id, ...body })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/events/:id — 행사 수정
  // admin_edited_at을 항상 서버에서 찍는다 — 이후 known-events.mjs 크롤러 동기화가
  // 이 행을 건너뛰게 해서, 관리자가 고친 값이 크롤러 값으로 덮어써지지 않게 막는다.
  if (idMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(idMatch[1])
    const body = await request.json()
    await supabase(env, 'PATCH', `events?id=eq.${encodeURIComponent(id)}`, {
      ...body,
      admin_edited_at: new Date().toISOString(),
    })
    return json({ ok: true }, env)
  }

  // DELETE /admin/events/:id — 행사 삭제
  if (idMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(idMatch[1])
    // FK 제약 해제: event_drafts.promoted_event_id 참조 먼저 NULL 처리
    await supabase(env, 'PATCH', `event_drafts?promoted_event_id=eq.${encodeURIComponent(id)}`, { promoted_event_id: null })
    await supabase(env, 'DELETE', `events?id=eq.${encodeURIComponent(id)}`)
    return new Response(null, { status: 204, headers: corsHeaders(env) })
  }

  return json({ error: 'not_found' }, env, { status: 404 })
}

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),

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

    if (pathname.startsWith('/admin/')) {
      try {
        return await handleAdmin(request, env, pathname)
      } catch (err) {
        return json({ error: 'internal_error', message: err.message }, env, { status: 500 })
      }
    }

    const handler = routes[pathname]
    if (!handler) return json({ error: 'not_found' }, env, { status: 404 })

    try {
      return await handler(request, env)
    } catch (err) {
      return json({ error: 'internal_error' }, env, { status: 500 })
    }
  },
}
