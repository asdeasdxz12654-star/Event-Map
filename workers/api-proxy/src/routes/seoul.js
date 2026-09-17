// GET /seoul-congestion?place=… — 서울시 실시간 도시데이터.
//
// 이 라우트는 우리 인증키(SEOUL_OPENDATA_KEY)로 서울시 원본을 대신 호출한다. CORS는
// 브라우저만 막지 curl은 못 막으므로, 그냥 두면 누구나 쓸 수 있는 공개 프록시다.
// 특히 place가 그대로 URL에 들어가는데 엣지 캐시의 키가 URL이라, 매번 다른 문자열을
// 넣으면 캐시를 통째로 우회해 요청 수만큼 원본을 때릴 수 있었다(= 일일 호출 한도를
// 스크립트 한 줄로 소진). 두 겹으로 막는다.
//   1) 장소 화이트리스트 — events.seoul_place_name에 실제로 들어 있는 이름만 허용.
//   2) IP당 요청 수 제한 — 허용된 장소만 골라 돌려도 원본 호출이 늘지 않게.
import { json, tooMany } from '../lib/http.js'
import { supabase } from '../lib/db.js'
import { clientIp } from '../lib/rate-limit.js'

const PLACES_TTL_MS = 10 * 60 * 1000 // 허용 장소 목록 캐시 수명
const RATE_LIMIT = 60                // IP당 허용 요청 수
const RATE_WINDOW_MS = 10 * 60 * 1000

let seoulPlaces = { names: null, fetchedAt: 0 }

async function allowedSeoulPlaces(env) {
  const now = Date.now()
  if (seoulPlaces.names && now - seoulPlaces.fetchedAt < PLACES_TTL_MS) return seoulPlaces.names
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return seoulPlaces.names
  try {
    const rows = await supabase(env, 'GET', 'events?select=seoul_place_name&seoul_place_name=not.is.null')
    const names = new Set((rows ?? []).map(row => row.seoul_place_name).filter(Boolean))
    // 조회에 성공했으면 결과가 비어 있어도 그게 답이다 — seoul_place_name을 쓰는 행사가
    // 하나도 없으면 어떤 place도 정당하지 않으므로 전부 거절해야 한다.
    // (처음엔 "0건이면 목록 없음"으로 뒀는데, 실제로 이 컬럼을 쓰는 행사가 하나도 없어서
    //  배포하자마자 모든 요청이 검사를 그냥 통과했다 — 잠그려던 구멍이 그대로 열려 있었다.)
    seoulPlaces = { names, fetchedAt: now }
    return names
  } catch (err) {
    // 여기는 "모른다"라서 다르다. 조회 자체가 실패한 것이므로 기능을 죽이지 않고
    // 마지막으로 성공한 목록을 계속 쓰고, 그것도 없으면 아래 레이트리밋만으로 버틴다.
    console.error('[seoul] 허용 장소 목록 조회 실패', err)
    return seoulPlaces.names
  }
}

// 카운터를 KV가 아니라 아이솔레이트 메모리에 둔다 — 무료 플랜 KV는 하루 쓰기 1,000회라,
// 요청마다 쓰는 공개 라우트에 붙이면 로그인 잠금용 카운터까지 같이 말라버린다.
// 콜로마다 따로 세지만, 목적("한 명이 스크립트로 원본을 두들기는 것" 차단)에는 충분하다.
const hits = new Map()

// 초과했으면 남은 초, 아니면 0.
function rateExceeded(request) {
  const ip = clientIp(request)
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    if (hits.size > 5000) {
      for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key)
    }
    return 0
  }
  entry.count += 1
  return entry.count > RATE_LIMIT ? Math.ceil((entry.resetAt - now) / 1000) : 0
}

// https로 먼저 부른다 — http면 인증키가 URL 경로에 평문으로 실려 나가고 중간 구간·원본
// 접근 로그에 그대로 남는다. 다만 서울시 쪽 8088 포트의 TLS 지원이 확실치 않아, 연결
// 자체가 실패하면 http로 한 번 더 간다(기능을 죽이지 않되 가능하면 평문을 피한다).
// 로그에 아래 경고가 찍히면 https가 안 되는 것이니 그때는 키 주기적 교체로 대응한다.
async function fetchSeoulCityData(key, place) {
  const path = `:8088/${key}/json/citydata/1/1/${encodeURIComponent(place)}`
  // 서울시 쪽은 캐시 헤더를 안 주기 때문에 cacheEverything을 명시해야 이 서브리퀘스트가
  // 엣지 캐시를 탄다. 이게 없으면 방문자 수만큼 그대로 원본을 때려서 일일 호출 한도를
  // 금방 태운다 (Worker 자기 응답의 Cache-Control은 브라우저/다운스트림용일 뿐이다).
  const cf = { cacheTtl: 120, cacheEverything: true }
  try {
    return await fetch(`https://openapi.seoul.go.kr${path}`, { cf })
  } catch (err) {
    console.warn('[seoul] https 호출 실패 — http로 폴백(인증키가 평문으로 나감)', err)
    return fetch(`http://openapi.seoul.go.kr${path}`, { cf })
  }
}

// 응답에서 우리가 쓰는 필드만 골라 반환한다.
// "서울시 주요 120장소"에 없는 장소명을 넘기면 ERROR-500이 오는데, 그것도
// 그대로 seoul_api_error로 넘겨서 프론트가 "지원 안 되는 장소" 처리하게 한다.
export async function handleSeoulCongestion(request, env) {
  if (!env.SEOUL_OPENDATA_KEY) {
    return json({ error: 'not_configured' }, env, { status: 501 })
  }
  const place = new URL(request.url).searchParams.get('place')
  if (!place) return json({ error: 'missing_place' }, env, { status: 400 })

  // 프론트(LiveCongestion)는 error가 오면 이 위젯을 그리지 않으므로, 아래 두 거절은
  // 정상 사용자 화면에서는 아무 변화도 만들지 않는다.
  const allowed = await allowedSeoulPlaces(env)
  if (allowed && !allowed.has(place)) {
    return json({ error: 'unsupported_place' }, env, { status: 400 })
  }

  const retryAfter = rateExceeded(request)
  if (retryAfter > 0) return tooMany('rate_limited', retryAfter, env)

  const res = await fetchSeoulCityData(env.SEOUL_OPENDATA_KEY, place)
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
    // 서울시 쪽 갱신 주기가 대략 5분이라, 그 사이 중복 호출은 캐시로 흡수한다
    // (여러 명이 동시에 같은 행사를 보고 있어도 서울시 API/키 호출량이 늘지 않게).
    { headers: { 'Cache-Control': 'public, max-age=120' } }
  )
}

// 검사에서 캐시 상태를 비운다.
export function __resetSeoulCache() {
  seoulPlaces = { names: null, fetchedAt: 0 }
  hits.clear()
}
