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
    '&select=title,description,start_date,end_date,venue,poster_url&limit=1'
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
