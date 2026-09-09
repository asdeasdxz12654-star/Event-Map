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
//   npx wrangler secret put SEOUL_OPENDATA_KEY (서울 열린데이터광장 인증키. /seoul-congestion 라우트가
//                                                이 키로 서울시 실시간 도시데이터 API를 대신 호출한다 —
//                                                프론트엔드에 키를 직접 박으면 번들에 노출되고, 그
//                                                API가 CORS도 지원 안 해서 브라우저에서 직접 호출 불가)

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

// 행사에 딸린 하위 목록(참가 부스, 출연진)은 구조가 같아서 라우트 패턴을 공유한다 —
// urlSegment(URL에 쓰는 이름) -> table(실제 Supabase 테이블명) 매핑만 다르다.
const SUB_RESOURCES = {
  booths: 'event_booths',
  performers: 'event_performers',
}
const subResourcePattern = Object.keys(SUB_RESOURCES).join('|')
const SUB_OF_EVENT_RE = new RegExp(`^/admin/events/([^/]+)/(${subResourcePattern})$`)
const SUB_ID_RE = new RegExp(`^/admin/(${subResourcePattern})/([^/]+)$`)

async function handleAdmin(request, env, pathname) {
  if (!await verifyAdmin(request, env)) {
    return json({ error: 'unauthorized' }, env, { status: 401 })
  }

  const idMatch = ID_RE.exec(pathname)
  const subOfEventMatch = SUB_OF_EVENT_RE.exec(pathname)
  const subIdMatch = SUB_ID_RE.exec(pathname)

  // POST /admin/events/:eventId/booths|performers — 하위 항목 추가
  if (subOfEventMatch && request.method === 'POST') {
    const eventId = decodeURIComponent(subOfEventMatch[1])
    const table = SUB_RESOURCES[subOfEventMatch[2]]
    const body = await request.json()
    const data = await supabase(env, 'POST', table, { event_id: eventId, ...body })
    return json(Array.isArray(data) ? data[0] : data, env, { status: 201 })
  }

  // PATCH /admin/booths|performers/:id — 하위 항목 수정
  if (subIdMatch && request.method === 'PATCH') {
    const table = SUB_RESOURCES[subIdMatch[1]]
    const id = decodeURIComponent(subIdMatch[2])
    const body = await request.json()
    await supabase(env, 'PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, body)
    return json({ ok: true }, env)
  }

  // DELETE /admin/booths|performers/:id — 하위 항목 삭제
  if (subIdMatch && request.method === 'DELETE') {
    const table = SUB_RESOURCES[subIdMatch[1]]
    const id = decodeURIComponent(subIdMatch[2])
    await supabase(env, 'DELETE', `${table}?id=eq.${encodeURIComponent(id)}`)
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
  const res = await fetch(url)
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
    // 서울시 쪽 갱신 주기가 대략 5분이라, 그 사이 중복 호출은 엣지에서 캐시로 흡수한다
    // (여러 명이 동시에 같은 행사를 보고 있어도 서울시 API/키 호출량이 늘지 않게).
    { headers: { 'Cache-Control': 'public, max-age=120' } }
  )
}

const routes = {
  '/health': (_req, env) => json({ ok: true, service: 'event-map-api-proxy' }, env),

  '/seoul-congestion': handleSeoulCongestion,

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
