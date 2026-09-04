// event-map-api-proxy
//
// 프론트엔드(Cloudflare Pages)가 API 키를 노출하지 않고 외부 API를 호출하기 위한 중계 Worker.
// 관리자 CRUD 엔드포인트(/admin/events)는 ADMIN_TOKEN_HASH 시크릿으로 검증 후
// SUPABASE_SERVICE_ROLE_KEY를 사용해 DB에 직접 쓴다.
//
// 시크릿 등록:
//   npx wrangler secret put SUPABASE_URL
//   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
//   npx wrangler secret put ADMIN_TOKEN_HASH   (값: adb9e48ae90664c4d7922aa850587360cff32781a14c3474d616b5ade016d621)
//   npx wrangler secret put ALLOWED_ORIGIN     (값: 프론트엔드 도메인, ex: https://your-site.pages.dev)

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

async function handleAdmin(request, env, pathname) {
  if (!await verifyAdmin(request, env)) {
    return json({ error: 'unauthorized' }, env, { status: 401 })
  }

  const idMatch = ID_RE.exec(pathname)

  // POST /admin/events — 행사 추가
  if (pathname === '/admin/events' && request.method === 'POST') {
    const body = await request.json()
    const id = crypto.randomUUID()
    const data = await supabase(env, 'POST', 'events', { id, ...body })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/events/:id — 행사 수정
  if (idMatch && request.method === 'PATCH') {
    const id = decodeURIComponent(idMatch[1])
    const body = await request.json()
    await supabase(env, 'PATCH', `events?id=eq.${encodeURIComponent(id)}`, body)
    return json({ ok: true }, env)
  }

  // DELETE /admin/events/:id — 행사 삭제
  if (idMatch && request.method === 'DELETE') {
    const id = decodeURIComponent(idMatch[1])
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
