import { describe, expect, it } from 'vitest'
import { HttpError, capText, corsHeaders, json, pick, readJsonBody, resolveOrigin, tooMany } from './http.js'

// Worker의 요청·응답 겉모양.
//
// 이 파일들은 오랫동안 검사가 하나도 없었다 — index.js 한 덩어리라 export가
// `export default { fetch }` 뿐이어서 밖에서 부를 수가 없었다. 가장 보안에 민감한
// 코드에 검사가 0개였고, 프런트에는 135개가 있었다.

const req = (body, init = {}) => new Request('https://x/', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
  ...init,
})

describe('pick — 허용한 컬럼만 통과시킨다', () => {
  it('목록에 있는 것만 가져온다', () => {
    expect(pick({ title: 'a', evil: 1 }, ['title'])).toEqual({ title: 'a' })
  })

  it('id를 실어 보내도 무시한다', () => {
    // 예전엔 { id, ...body } 순서 탓에 body의 id가 서버가 만든 UUID를 덮어썼고,
    // PATCH로는 기본키를 통째로 갈아치울 수도 있었다.
    expect(pick({ id: 'hijack', title: 'a' }, ['title'])).toEqual({ title: 'a' })
  })

  it('null도 값이다 — "지우기"를 못 보내면 값을 비울 방법이 없다', () => {
    expect(pick({ poster_url: null }, ['poster_url'])).toEqual({ poster_url: null })
  })

  it('없는 키는 넣지 않는다 (undefined로 덮어쓰지 않게)', () => {
    expect(pick({ title: 'a' }, ['title', 'venue'])).toEqual({ title: 'a' })
    expect('venue' in pick({ title: 'a' }, ['title', 'venue'])).toBe(false)
  })

  it('프로토타입 오염을 막는다', () => {
    // {}.toString은 hasOwnProperty가 false라 안 넘어와야 한다.
    expect(pick({}, ['toString', 'constructor'])).toEqual({})
  })

  it('body가 없어도 터지지 않는다', () => {
    expect(pick(null, ['title'])).toEqual({})
    expect(pick(undefined, ['title'])).toEqual({})
  })
})

describe('capText — 막지 않고 자른다', () => {
  it('상한까지 자른다', () => {
    expect(capText('가'.repeat(100), 10)).toHaveLength(10)
  })

  it('앞뒤 공백을 턴다', () => {
    expect(capText('  a  ', 10)).toBe('a')
  })

  it('빈 값은 null', () => {
    expect(capText('', 10)).toBeNull()
    expect(capText('   ', 10)).toBeNull()
    expect(capText(null, 10)).toBeNull()
    expect(capText(123, 10)).toBeNull()
  })
})

describe('corsHeaders', () => {
  it('Retry-After를 노출한다', () => {
    // 기본 노출 목록에 없어서, 명시하지 않으면 브라우저 JS가 429의 대기 시간을 못 읽는다.
    expect(corsHeaders({})['Access-Control-Expose-Headers']).toBe('Retry-After')
  })

  it('Vary: Origin이 있다', () => {
    // 없으면 Cache-Control이 걸린 응답에서 A오리진용 ACAO가 박힌 캐시본이
    // B오리진 요청에 그대로 나가 CORS가 깨진다.
    expect(corsHeaders({}).Vary).toBe('Origin')
  })

  it('설정이 없으면 *', () => {
    expect(corsHeaders({})['Access-Control-Allow-Origin']).toBe('*')
  })
})

describe('resolveOrigin', () => {
  const env = { ALLOWED_ORIGIN: 'https://a.example, https://b.example' }

  it('목록에 있으면 그 값을 그대로 돌려준다', () => {
    expect(resolveOrigin(env, 'https://b.example')).toBe('https://b.example')
  })

  it('목록에 없으면 첫 값으로 돌아간다 (와일드카드를 주지 않는다)', () => {
    expect(resolveOrigin(env, 'https://evil.example')).toBe('https://a.example')
    expect(resolveOrigin(env, null)).toBe('https://a.example')
  })

  it('설정이 비었으면 * (설정 전 배포에서 기능이 죽지 않게)', () => {
    expect(resolveOrigin({}, 'https://x')).toBe('*')
    expect(resolveOrigin({ ALLOWED_ORIGIN: '  ,  ' }, 'https://x')).toBe('*')
  })
})

describe('json / tooMany', () => {
  it('CORS 헤더를 함께 붙인다', async () => {
    const res = json({ a: 1 }, {})
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await res.json()).toEqual({ a: 1 })
  })

  it('tooMany는 429 + Retry-After', async () => {
    const res = tooMany('too_many_reports', 3600, {})
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('3600')
    expect(await res.json()).toEqual({ error: 'too_many_reports' })
  })
})

describe('readJsonBody — 깨진 요청은 400이지 500이 아니다', () => {
  it('객체를 읽는다', async () => {
    expect(await readJsonBody(req({ a: 1 }))).toEqual({ a: 1 })
  })

  it.each([
    ['깨진 JSON', '{nope'],
    ['배열', '[1,2]'],
    ['null', 'null'],
    ['숫자', '42'],
    ['문자열', '"hi"'],
  ])('%s은 400 invalid_json', async (_name, raw) => {
    await expect(readJsonBody(req(raw))).rejects.toMatchObject({
      status: 400, code: 'invalid_json',
    })
  })

  it('던지는 것은 HttpError다', async () => {
    await expect(readJsonBody(req('{'))).rejects.toBeInstanceOf(HttpError)
  })
})
