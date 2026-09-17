import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index.js'
import { __resetMemoryStore } from './lib/rate-limit.js'
import { __resetSeoulCache } from './routes/seoul.js'
import { issueSessionToken } from './lib/auth.js'

// Worker 전체를 실제로 불러본다.
//
// 왜 이렇게 재나
//   `wrangler dev`가 이 개발 PC에서 안 뜬다(workerd 런타임 충돌). 그런데 fetch 핸들러는
//   그냥 함수라서, Request를 만들어 직접 부르면 라우팅·인증·오류 번역이 전부 지나간다.
//   일회성으로 curl을 두들기는 것보다 이쪽이 낫다 — 다음에 누가 라우트를 옮겨도 같은
//   검사가 다시 돈다.
//
//   바깥으로 나가는 fetch(Supabase)만 가로챈다. 그 너머는 우리 코드가 아니다.

const SECRET = 'test-secret-for-worker'
// 'test'의 SHA-256 (예전 형식 해시). 검사용이라 무엇이든 상관없다.
const PW_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

const env = {
  SUPABASE_URL: 'https://db.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ADMIN_PASSWORD_HASH: PW_HASH,
  SESSION_SECRET: SECRET,
  ALLOWED_ORIGIN: 'https://event-map.pages.dev',
}

let outgoing = []

// Supabase 응답을 흉내낸다. 기본은 "성공, 행 하나".
function stubSupabase(reply = { status: 200, body: [{ id: 'row1' }] }) {
  outgoing = []
  globalThis.fetch = vi.fn(async (url, init) => {
    outgoing.push({ url: String(url), method: init?.method, body: init?.body })
    const r = typeof reply === 'function' ? reply(String(url), init) : reply
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status })
  })
}

const call = (path, init = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, {
    headers: { 'CF-Connecting-IP': '1.2.3.4', ...(init.headers ?? {}) },
    ...init,
  }), env)

const withToken = async (path, init = {}) => call(path, {
  ...init,
  headers: { Authorization: `Bearer ${await issueSessionToken(env)}`, ...(init.headers ?? {}) },
})

beforeEach(() => {
  __resetMemoryStore()
  __resetSeoulCache()
  stubSupabase()
})
afterEach(() => vi.restoreAllMocks())

describe('기본 라우팅', () => {
  it('OPTIONS는 CORS 헤더만 준다', async () => {
    const res = await call('/admin/events', { method: 'OPTIONS' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH')
  })

  it('허용 목록에 있는 Origin은 그대로 돌려준다', async () => {
    const res = await call('/health', { headers: { Origin: 'https://event-map.pages.dev' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://event-map.pages.dev')
  })

  it('모르는 Origin에는 와일드카드를 주지 않는다', async () => {
    const res = await call('/health', { headers: { Origin: 'https://evil.test' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://event-map.pages.dev')
  })

  it('/health는 200', async () => {
    expect((await call('/health')).status).toBe(200)
  })

  it('모르는 경로는 404', async () => {
    const res = await call('/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})

describe('관리자 인증', () => {
  it.each([
    '/admin/events', '/admin/drafts', '/admin/reports',
    '/admin/client-errors', '/admin/job-runs', '/admin/uploads',
  ])('%s는 토큰 없이 401', async path => {
    const res = await call(path)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('DB를 부르지도 않는다 — 인증이 먼저다', async () => {
    await call('/admin/drafts')
    expect(outgoing).toHaveLength(0)
  })

  it('비밀번호가 틀리면 401', async () => {
    const res = await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_credentials' })
  })

  it('맞으면 토큰을 준다', async () => {
    const res = await call('/admin/login', { method: 'POST', body: JSON.stringify({ password: 'test' }) })
    expect(res.status).toBe(200)
    const { token } = await res.json()
    expect(token).toMatch(/^\d+\.[0-9a-f]+$/)
  })

  it('시크릿이 없으면 로그인을 아예 막는다', async () => {
    // 예전엔 SESSION_SECRET이 없어도 "성공"하면서 토큰을 내줬고, 그 토큰으로는
    // 모든 요청이 401이었다 — 원인 모를 상태에 빠진다.
    const res = await worker.fetch(
      new Request('https://api.test/admin/login', { method: 'POST', body: '{}' }),
      { ...env, SESSION_SECRET: undefined }
    )
    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('여러 번 틀리면 잠긴다', async () => {
    const body = JSON.stringify({ password: 'wrong' })
    for (let i = 0; i < 5; i++) await call('/admin/login', { method: 'POST', body })
    const res = await call('/admin/login', { method: 'POST', body })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })
})

describe('검수 표 — 넷이 한 벌의 코드를 쓴다', () => {
  it.each([
    ['drafts', 'event_drafts', 'status=eq.pending'],
    ['reports', 'event_reports', 'status=eq.open'],
    ['client-errors', 'client_errors', 'status=eq.open'],
  ])('/admin/%s는 %s를 기본 상태로 조회한다', async (route, table, filter) => {
    await withToken(`/admin/${route}`)
    expect(outgoing[0].url).toContain(`/rest/v1/${table}?`)
    expect(outgoing[0].url).toContain(filter)
    expect(outgoing[0].url).toContain('limit=200')
  })

  it('제보 목록에는 행사 제목이 함께 온다', async () => {
    // 제보만 봐서는 어느 행사 얘기인지 id밖에 안 보인다.
    await withToken('/admin/reports')
    expect(outgoing[0].url).toContain('select=*,events(title,start_date)')
  })

  it('job-runs에는 상태 필터가 없다', async () => {
    await withToken('/admin/job-runs')
    expect(outgoing[0].url).toContain('job_runs?')
    expect(outgoing[0].url).not.toContain('status=eq.')
  })

  it('모르는 상태는 400이고 DB를 부르지 않는다', async () => {
    const res = await withToken('/admin/drafts?status=하하')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_status' })
    expect(outgoing).toHaveLength(0)
  })

  it('PATCH는 바뀐 행을 돌려준다', async () => {
    // 승인이 실패하면 트리거가 그 행만 rejected로 돌린다 — {ok:true}만 주면
    // "승인했는데 왜 반려됨?"을 알 길이 없다.
    stubSupabase({ status: 200, body: [{ id: 'd1', status: 'rejected', review_note: '중복' }] })
    const res = await withToken('/admin/drafts/d1', {
      method: 'PATCH', body: JSON.stringify({ status: 'approved' }),
    })
    expect(await res.json()).toMatchObject({ status: 'rejected' })
  })

  it('읽기 전용 표는 PATCH가 405', async () => {
    const res = await withToken('/admin/job-runs/x', { method: 'PATCH', body: '{}' })
    expect(res.status).toBe(405)
  })

  it('제보를 처리하면 처리 시각을 서버가 찍는다', async () => {
    await withToken('/admin/reports/r1', { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) })
    expect(JSON.parse(outgoing[0].body)).toHaveProperty('reviewed_at')
  })

  it('허용 안 한 컬럼은 버린다', async () => {
    await withToken('/admin/drafts/d1', {
      method: 'PATCH', body: JSON.stringify({ status: 'approved', extracted: { evil: 1 } }),
    })
    expect(JSON.parse(outgoing[0].body)).toEqual({ status: 'approved' })
  })
})

describe('행사 CRUD', () => {
  it('POST는 서버가 id를 정한다', async () => {
    await withToken('/admin/events', {
      method: 'POST', body: JSON.stringify({ id: 'hijack', title: '테스트', start_date: '2026-01-01' }),
    })
    const sent = JSON.parse(outgoing[0].body)
    expect(sent.id).not.toBe('hijack')
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('PATCH는 admin_edited_at을 항상 찍는다', async () => {
    await withToken('/admin/events/e1', { method: 'PATCH', body: JSON.stringify({ title: '새 제목' }) })
    expect(JSON.parse(outgoing[0].body)).toHaveProperty('admin_edited_at')
  })

  it('unlock은 그 값을 지운다', async () => {
    await withToken('/admin/events/e1/unlock', { method: 'POST' })
    expect(JSON.parse(outgoing[0].body)).toEqual({ admin_edited_at: null })
  })

  it('unlock 경로가 행사 수정으로 새지 않는다', async () => {
    // /admin/events/:id 정규식이 /unlock까지 먹으면 잠금 해제가 행사 수정이 된다.
    await withToken('/admin/events/e1/unlock', { method: 'POST' })
    expect(outgoing[0].url).toContain('id=eq.e1')
    expect(JSON.parse(outgoing[0].body)).not.toHaveProperty('title')
  })

  it('javascript: 주소는 저장 전에 막는다', async () => {
    const res = await withToken('/admin/events/e1', {
      method: 'PATCH', body: JSON.stringify({ poster_url: 'javascript:alert(1)' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_url' })
    expect(outgoing).toHaveLength(0)
  })

  it('DELETE는 204이고 본문이 없다', async () => {
    stubSupabase({ status: 200, body: '' })
    const res = await withToken('/admin/events/e1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
  })

  it('하위 항목은 event_id를 URL에서 받는다', async () => {
    await withToken('/admin/events/e1/booths', {
      method: 'POST', body: JSON.stringify({ name: '부스', event_id: 'someone-else' }),
    })
    expect(JSON.parse(outgoing[0].body).event_id).toBe('e1')
  })
})

describe('DB가 거절한 것을 뭐라고 말하나', () => {
  it('제약 위반은 400이다 (예전엔 전부 500이었다)', async () => {
    // 관리자 화면에서 날짜를 잘못 넣으면 "서버 오류로 저장하지 못했습니다"가 떴다 —
    // 자기 입력 실수인데 서버 탓으로 읽히고 고칠 실마리가 없었다.
    stubSupabase({ status: 400, body: { code: '23514', message: 'violates check constraint' } })
    const res = await withToken('/admin/events/e1', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_value' })
  })

  it('없는 대상을 가리키면 400 invalid_reference', async () => {
    stubSupabase({ status: 409, body: { code: '23503', message: 'foreign key' } })
    const res = await withToken('/admin/events/e1/booths', { method: 'POST', body: JSON.stringify({ name: 'a' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_reference' })
  })

  it('모르는 실패는 여전히 500이다', async () => {
    // 우리 잘못일 수 있는 것을 "요청이 잘못됐다"고 답하면 진짜 고장이 조용해진다.
    stubSupabase({ status: 500, body: { code: 'XX000', message: 'internal' } })
    const res = await withToken('/admin/events/e1', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })

  it('원문 메시지는 응답에 싣지 않는다', async () => {
    // 테이블·컬럼·제약 이름이 그대로 들어 있다.
    stubSupabase({ status: 400, body: { code: '23514', message: 'events_ticket_status_check' } })
    const res = await withToken('/admin/events/e1', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })
    expect(JSON.stringify(await res.json())).not.toContain('events_ticket_status_check')
  })

  it('없는 id를 고치면 404다', async () => {
    stubSupabase({ status: 200, body: [] })
    const res = await withToken('/admin/events/nope', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })
    expect(res.status).toBe(404)
  })
})

describe('로그인 없이 쓰는 문', () => {
  it('제보는 IP당 1시간 5건까지', async () => {
    const body = JSON.stringify({ kind: 'new_event', message: '이런 행사가 있어요' })
    for (let i = 0; i < 5; i++) {
      expect((await call('/reports', { method: 'POST', body })).status, `${i + 1}번째`).toBe(201)
    }
    const res = await call('/reports', { method: 'POST', body })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('correction에는 행사 id가 있어야 한다', async () => {
    const res = await call('/reports', {
      method: 'POST', body: JSON.stringify({ kind: 'correction', message: '날짜가 틀렸어요' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_report' })
  })

  it('오류 보고는 제보와 따로 센다', async () => {
    // 한 사람이 오류를 많이 겪었다는 이유로 그 사람의 제보까지 막히면 안 된다.
    const err = JSON.stringify({ fingerprint: 'abc', message: '터짐', kind: 'error' })
    for (let i = 0; i < 6; i++) await call('/client-errors', { method: 'POST', body: err })
    const res = await call('/reports', {
      method: 'POST', body: JSON.stringify({ kind: 'new_event', message: '이런 행사가 있어요' }),
    })
    expect(res.status).toBe(201)
  })

  it('오류 보고는 fingerprint와 message가 없으면 400', async () => {
    const res = await call('/client-errors', { method: 'POST', body: JSON.stringify({ kind: 'error' }) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_error_report' })
  })

  it('오류 보고는 긴 값을 막지 않고 자른다', async () => {
    await call('/client-errors', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'abc', message: '가'.repeat(5000), kind: 'boundary' }),
    })
    expect(outgoing[0].url).toContain('rpc/record_client_error')
    expect(JSON.parse(outgoing[0].body).p_message).toHaveLength(500)
  })

  it('알림 끄기는 토큰 형식을 본다', async () => {
    const short = await call('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ token: 'x' }) })
    expect(short.status).toBe(400)
    const ok = await call('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ token: 'a'.repeat(150) }) })
    expect(ok.status).toBe(200)
  })

  it('GET으로는 못 부른다', async () => {
    for (const path of ['/reports', '/client-errors', '/push/unsubscribe']) {
      expect((await call(path)).status, path).toBe(405)
    }
  })

  it('깨진 JSON은 400이지 500이 아니다', async () => {
    const res = await call('/reports', { method: 'POST', body: '{nope' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_json' })
  })
})

describe('서울시 혼잡도', () => {
  it('키가 없으면 501', async () => {
    const res = await worker.fetch(
      new Request('https://api.test/seoul-congestion?place=강남역'),
      { ...env, SEOUL_OPENDATA_KEY: undefined }
    )
    expect(res.status).toBe(501)
  })

  it('place가 없으면 400', async () => {
    const res = await worker.fetch(
      new Request('https://api.test/seoul-congestion'),
      { ...env, SEOUL_OPENDATA_KEY: 'k' }
    )
    expect(res.status).toBe(400)
  })

  it('허용 목록에 없는 장소는 거절한다', async () => {
    // 여기가 열려 있으면 매번 다른 문자열로 엣지 캐시를 우회해 원본 한도를 태울 수 있다.
    stubSupabase({ status: 200, body: [{ seoul_place_name: '강남역' }] })
    const res = await worker.fetch(
      new Request('https://api.test/seoul-congestion?place=아무데나', { headers: { 'CF-Connecting-IP': '1.1.1.1' } }),
      { ...env, SEOUL_OPENDATA_KEY: 'k' }
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unsupported_place' })
  })
})
