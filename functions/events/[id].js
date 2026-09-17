// 행사별 링크 미리보기(OG 태그)를 서버에서 만들어 준다. — Cloudflare Pages Functions
//
// 왜 필요한가
//   이 앱은 정적 SPA라 카카오톡·트위터·디스코드의 미리보기 봇이 JS를 실행하지 않는다.
//   그래서 /events/<id> 링크를 공유해도 봇이 읽는 건 index.html의 기본 태그뿐이고,
//   어떤 행사를 공유하든 미리보기가 "게임이벤트허브 — 국내 게임·코스프레…"로 똑같이 떴다.
//   (index.html 주석에 "행사별 공유는 서버 렌더링 없인 못 만든다"고 적어둔 그 한계다.)
//
//   Cloudflare Pages는 이 파일 하나로 그 한계를 넘을 수 있다. /events/:id 요청이 오면
//   정적 index.html을 가져와 제목·설명·이미지 메타만 그 행사 값으로 바꿔서 돌려준다.
//   HTML 본문(앱)은 그대로라 사용자 화면·동작은 전혀 달라지지 않는다.
//
// GitHub Pages 배포에는 이 파일이 적용되지 않는다(정적 서버라 함수를 실행할 수 없다).
// 그쪽은 지금까지처럼 공통 미리보기가 뜬다 — 그래서 공유용 링크는 Cloudflare 쪽 도메인을
// 쓰는 편이 낫다.
//
// Cloudflare Pages > 설정 > 환경 변수에 아래 둘이 필요하다(둘 다 이미 프론트 번들에 들어가는
// 공개 값이라 새로 노출되는 비밀이 없다):
//   SUPABASE_URL, SUPABASE_ANON_KEY
// 없거나 조회가 실패하면 아무것도 바꾸지 않고 원래 index.html을 그대로 돌려준다.

const SITE_NAME = '게임이벤트허브'
const FETCH_TIMEOUT_MS = 3000

// "2026-12-04" -> "2026.12.04"
export function dot(dateStr) {
  return typeof dateStr === 'string' ? dateStr.replaceAll('-', '.') : ''
}

export function periodText(event) {
  const start = dot(event.start_date)
  const end = dot(event.end_date)
  if (!start) return ''
  if (!end || end === start) return start
  // 같은 해면 종료일은 월·일만 ("2026.12.04 ~ 12.06")
  return end.slice(0, 4) === start.slice(0, 4) ? `${start} ~ ${end.slice(5)}` : `${start} ~ ${end}`
}

export function buildDescription(event) {
  const head = [periodText(event), event.venue].filter(Boolean).join(' · ')
  const body = (event.description ?? '').trim()
  const text = [head, body].filter(Boolean).join(' — ')
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

export async function fetchEvent(env, id) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  const url = `${env.SUPABASE_URL}/rest/v1/events` +
    `?id=eq.${encodeURIComponent(id)}` +
    '&select=title,description,start_date,end_date,venue,venue_address,poster_url,category,organizer,admission_fee,ticket_url,ticket_status,website&limit=1'
  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows[0]?.title ? rows[0] : null
  } catch {
    return null // 조회 실패는 미리보기 품질 문제일 뿐이라, 페이지 자체는 그대로 서빙한다
  }
}

// 이 행사로 바꿔 넣을 미리보기 값. HTMLRewriter 없이도 검증할 수 있게 분리해 뒀다.
export function buildPreview(event, origin, pathname) {
  // 포스터가 없거나 https가 아니면 기본 이미지를 쓴다 — 미리보기 봇은 http 이미지를 자주 무시한다.
  const poster = typeof event.poster_url === 'string' && event.poster_url.startsWith('https://')
    ? event.poster_url
    : null
  return {
    title: `${event.title} | ${SITE_NAME}`,
    description: buildDescription(event) || `${SITE_NAME}에서 행사 정보를 확인하세요`,
    image: poster ?? `${origin}/og-image.png`,
    canonical: `${origin}${pathname}`,
    isPoster: Boolean(poster),
  }
}

// 검색엔진용 구조화 데이터(schema.org/Event).
//
// 왜 필요한가
//   구글·네이버가 행사를 날짜·장소 카드로 보여주는 근거가 이것이다. 없으면 우리 페이지는
//   그냥 텍스트 하나이고, 있으면 검색 결과에서 자리를 더 차지한다.
//   이 앱은 SPA라 봇이 본문을 못 읽으므로, 봇이 읽을 수 있는 유일한 사실 진술이기도 하다.
//
// 값을 지어내지 않는다 — 비어 있는 필드는 넣지 않는다. 구조화 데이터에 틀린 값을 넣으면
// 검색엔진이 사이트 전체를 덜 믿게 된다.
export function buildEventJsonLd(event, canonical, image) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url: canonical,
    startDate: event.start_date,
    // 하루짜리면 종료일이 시작일과 같다. 그대로 적어도 맞다.
    endDate: event.end_date ?? event.start_date,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    image: [image],
  }

  const description = buildDescription(event)
  if (description) data.description = description

  if (event.venue) {
    data.location = {
      '@type': 'Place',
      name: event.venue,
      ...(event.venue_address
        ? { address: { '@type': 'PostalAddress', streetAddress: event.venue_address, addressCountry: 'KR' } }
        : {}),
    }
  }

  if (event.organizer) {
    data.organizer = { '@type': 'Organization', name: event.organizer, ...(event.website ? { url: event.website } : {}) }
  }

  // 예매 정보. 가격을 모르면 price를 쓰지 않는다 — 0으로 적으면 "무료"라는 뜻이 된다.
  if (event.ticket_url || event.ticket_status === 'soldout') {
    const availability = event.ticket_status === 'soldout'
      ? 'https://schema.org/SoldOut'
      : event.ticket_status === 'available'
        ? 'https://schema.org/InStock'
        : null
    data.offers = {
      '@type': 'Offer',
      ...(event.ticket_url ? { url: event.ticket_url } : {}),
      ...(availability ? { availability } : {}),
      ...(isFree(event.admission_fee) ? { price: '0', priceCurrency: 'KRW' } : {}),
    }
  }

  return data
}

// "무료", "무료 입장" 등만 0원으로 본다. "1일권 15,000원" 같은 값에서 숫자를 뽑아내면
// 어느 권종의 가격인지 우리가 정하는 셈이라, 애매하면 가격을 안 적는다.
function isFree(fee) {
  return typeof fee === 'string' && /^\s*무료/.test(fee)
}

// JSON을 <script> 안에 넣을 때 '<'를 그대로 두면 본문 중 "</script>"가 태그를 닫아버린다.
// 유니코드 이스케이프는 JSON 파서가 똑같이 읽으므로 내용은 안 바뀐다.
export function jsonLdScript(data) {
  // String.raw를 쓰는 이유: 그냥 '\u003c'라고 적으면 JS가 그걸 '<' 한 글자로
  // 읽어서 치환이 아무 일도 안 한다 — 그리고 그 사실이 눈에 전혀 안 띈다.
  const json = JSON.stringify(data).replaceAll('<', String.raw`\u003c`)
  return `<script type="application/ld+json">${json}</script>`
}

// 이 함수가 실제로 돌았는지, 안 됐다면 왜인지 헤더 하나로 확인할 수 있게 표시를 남긴다.
// (미리보기 태그는 봇만 읽어서, 잘못돼도 화면상으로는 아무 차이가 없다 — 그래서 확인할
//  방법이 없으면 "됐겠거니" 하고 넘어가게 된다.)
//   curl -I https://<도메인>/events/<id> | grep x-event-preview
//     헤더 없음 -> 함수가 배포되지 않았다(=Pages가 functions/ 를 못 찾음)
//     no-env    -> SUPABASE_URL/SUPABASE_ANON_KEY가 안 붙었다. 환경변수는 추가 후
//                  "재배포"를 해야 기존 배포에 적용된다.
//     no-event  -> 그 id의 행사를 못 찾았거나 조회 실패
//     hit       -> 정상 (그 행사 값으로 태그가 바뀜)
function withMarker(response, marker) {
  const out = new Response(response.body, response)
  out.headers.set('x-event-preview', marker)

  // 이 응답은 /index.html에서 출발했지만 행사마다 내용이 다르다. 원본의 검증자·캐시
  // 지시자를 그대로 달고 나가면 중간 캐시(브라우저·CDN)가 "index.html"로 알아보고
  // 한 행사의 미리보기를 다른 행사 주소에 그대로 내줄 수 있다. ETag/Last-Modified는
  // 떼고, 짧게만 캐시하게 바꾼다 — 미리보기 봇이 다시 긁을 때 최신 값을 받게.
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  out.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate')
  return out
}

export async function onRequestGet(context) {
  const { request, env, params } = context

  // 앱 껍데기(index.html)를 그대로 가져온다 — /events/:id는 실제 파일이 아니라 SPA 경로다.
  const pageUrl = new URL(request.url)
  const asset = await env.ASSETS.fetch(new URL('/index.html', pageUrl.origin))

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return withMarker(asset, 'no-env')

  const event = await fetchEvent(env, params.id)
  if (!event) return withMarker(asset, 'no-event')

  const { title, description, image, canonical, isPoster } = buildPreview(event, pageUrl.origin, pageUrl.pathname)

  const setContent = value => ({ element: el => el.setAttribute('content', value) })
  const remove = { element: el => el.remove() }

  let rewriter = new HTMLRewriter()
    .on('title', { element: el => el.setInnerContent(title) })
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:type"]', setContent('article'))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[property="og:image"]', setContent(image))
    .on('meta[property="og:url"]', setContent(canonical))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="twitter:description"]', setContent(description))
    .on('meta[name="twitter:image"]', setContent(image))
    // index.html의 canonical은 홈 주소다. 이 페이지의 정식 주소로 바꾼다 —
    // 안 바꾸면 모든 행사 페이지가 "나는 홈페이지다"라고 말하게 된다.
    .on('link[rel="canonical"]', { element: el => el.setAttribute('href', canonical) })
    // 봇이 읽을 수 있는 유일한 사실 진술. head 끝에 붙인다.
    .on('head', { element: el => el.append(jsonLdScript(buildEventJsonLd(event, canonical, image)), { html: true }) })

  if (isPoster) {
    // 기본 이미지(og-image.png)에 맞춰 박아둔 1200x630은 포스터에는 틀린 값이다.
    // 잘못된 크기를 알려주면 미리보기가 이상하게 잘리므로 아예 뺀다.
    rewriter = rewriter
      .on('meta[property="og:image:width"]', remove)
      .on('meta[property="og:image:height"]', remove)
      // 포스터는 세로형이라 큰 이미지 카드보다 정사각 썸네일 쪽이 덜 잘린다.
      .on('meta[name="twitter:card"]', setContent('summary'))
  }

  return rewriter.transform(withMarker(asset, 'hit'))
}
