import { afterEach, describe, expect, it, vi } from 'vitest'
import { asRequestError, firstRow, supabase, updateRow } from './db.js'
import { HttpError } from './http.js'

// Supabase 호출과 실패의 번역.
//
// 여기서 잡으려는 것: **DB가 거절한 것이 전부 "서버 오류"로 나가던 문제.**
// 관리자 화면에서 날짜를 잘못 넣거나 없는 행사에 부스를 붙이면 500이 떴고, 화면에는
// "서버 오류로 저장하지 못했습니다"가 나왔다 — 자기 입력 실수인데 서버 탓으로 읽히고
// 고칠 실마리가 없다. 그리고 진짜 서버 오류가 같은 코드에 묻혀 로그에서 구분이 안 됐다.

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }

function stubFetch(status, body) {
  const calls = []
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  })
  return calls
}

afterEach(() => { vi.restoreAllMocks() })

describe('supabase()', () => {
  it('service_role 키를 헤더 두 곳에 넣는다', async () => {
    const calls = stubFetch(200, [{ id: 1 }])
    await supabase(env, 'GET', 'events?select=id')
    expect(calls[0].url).toBe('https://db.test/rest/v1/events?select=id')
    expect(calls[0].init.headers.apikey).toBe('service-key')
    expect(calls[0].init.headers.Authorization).toBe('Bearer service-key')
  })

  it('DELETE만 return=minimal이다', async () => {
    // PATCH가 minimal이면 "0행 수정"도 성공으로 와서, 없는 id로 PATCH해도 200이 나갔다.
    // 빈 배열로 404를 판별하려면 representation이 필요하다.
    const calls = stubFetch(200, '')
    await supabase(env, 'DELETE', 'events?id=eq.1')
    expect(calls[0].init.headers.Prefer).toBe('return=minimal')
    await supabase(env, 'PATCH', 'events?id=eq.1', { title: 'a' })
    expect(calls[1].init.headers.Prefer).toBe('return=representation')
  })

  it('빈 응답은 null이다 (JSON.parse로 터지지 않게)', async () => {
    stubFetch(200, '')
    expect(await supabase(env, 'DELETE', 'events?id=eq.1')).toBeNull()
  })

  it('실패하면 SQLSTATE를 에러에 붙여 던진다', async () => {
    stubFetch(400, { code: '23514', message: 'violates check constraint' })
    await expect(supabase(env, 'POST', 'events', {})).rejects.toMatchObject({ dbCode: '23514' })
  })

  it('PostgREST가 아닌 응답이면 코드는 null이다', async () => {
    // 게이트웨이 오류 등. 코드가 없는 게 맞고, 그건 500으로 가야 한다.
    stubFetch(502, '<html>Bad Gateway</html>')
    await expect(supabase(env, 'GET', 'events')).rejects.toMatchObject({ dbCode: null })
  })
})

describe('asRequestError — 요청이 잘못된 것만 400으로 바꾼다', () => {
  const withCode = code => Object.assign(new Error('x'), { dbCode: code })

  it.each([
    ['23502 필수 값 없음', '23502', 400, 'missing_required'],
    ['23503 없는 대상을 가리킴', '23503', 400, 'invalid_reference'],
    ['23514 허용 범위 밖', '23514', 400, 'invalid_value'],
    ['22P02 숫자/uuid 형식', '22P02', 400, 'invalid_value'],
    ['22007 날짜 형식', '22007', 400, 'invalid_value'],
    ['22001 너무 김', '22001', 400, 'invalid_value'],
    ['23505 이미 있음', '23505', 409, 'duplicate'],
  ])('%s', (_name, code, status, error) => {
    const mapped = asRequestError(withCode(code))
    expect(mapped).toBeInstanceOf(HttpError)
    expect(mapped.status).toBe(status)
    expect(mapped.code).toBe(error)
  })

  it('모르는 실패는 null이다 — 400이라고 우기지 않는다', () => {
    // 우리 잘못일 수 있는 것을 "요청이 잘못됐다"고 답하면, 진짜 고장이 조용해진다.
    expect(asRequestError(withCode('XX000'))).toBeNull()
    expect(asRequestError(withCode(null))).toBeNull()
    expect(asRequestError(new Error('그냥 오류'))).toBeNull()
    expect(asRequestError(undefined)).toBeNull()
  })
})

describe('updateRow', () => {
  it('바뀐 행을 돌려준다', async () => {
    stubFetch(200, [{ id: 'a', status: 'approved' }])
    expect(await updateRow(env, 'event_drafts', 'a', { status: 'approved' }))
      .toEqual({ id: 'a', status: 'approved' })
  })

  it('없는 id면 404다 (조용한 200이 아니다)', async () => {
    stubFetch(200, [])
    await expect(updateRow(env, 'events', 'nope', { title: 'a' }))
      .rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('source_watches만 기본키가 key다', async () => {
    const calls = stubFetch(200, [{ key: 'k' }])
    await updateRow(env, 'source_watches', 'comicworld', { acknowledged_at: 'now' })
    expect(calls[0].url).toContain('source_watches?key=eq.comicworld')
    await updateRow(env, 'events', 'e1', { title: 'a' })
    expect(calls[1].url).toContain('events?id=eq.e1')
  })

  it('id를 URL 인코딩한다', async () => {
    const calls = stubFetch(200, [{ id: 'a b' }])
    await updateRow(env, 'events', 'a b&c', { title: 'x' })
    expect(calls[0].url).toContain('id=eq.a%20b%26c')
  })
})

describe('firstRow', () => {
  it('배열이면 첫 행', () => {
    expect(firstRow([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 })
  })
  it('배열이 아니면 그대로', () => {
    expect(firstRow({ id: 1 })).toEqual({ id: 1 })
    expect(firstRow(null)).toBeNull()
  })
})
