// 검색엔진에 우리 페이지 목록을 알려준다. — Cloudflare Pages Functions
//
// 왜 필요한가
//   이 앱은 정적 SPA다. 검색봇이 첫 페이지를 받아도 목록은 JS로 그려지므로, 링크를 타고
//   행사 상세로 들어갈 길이 없다. 사이트맵이 없으면 행사 페이지 51개가 사실상 검색엔진에
//   존재하지 않는다.
//
// 왜 빌드 때 굽지 않나
//   크롤러가 매일 돌아 행사가 늘어나는데, 빌드 산출물로 구우면 다음 배포 전까지 새 행사가
//   사이트맵에 안 들어간다. 배포는 코드가 바뀔 때만 일어난다 — 며칠씩 벌어질 수 있다.
//   요청이 올 때 만들고 캐시를 짧게 두는 편이 실제와 가깝다.
//
// 주의: /* /index.html 200 리라이트(public/_redirects) 때문에 이 파일이 없으면
//       /sitemap.xml 요청에 **HTML이 200으로** 나간다. 없는 것보다 나쁘다 —
//       사이트맵이 있는 것처럼 보이면서 내용은 파싱 실패다.

const FETCH_TIMEOUT_MS = 5000
const CACHE_SECONDS = 3600
// PostgREST 기본 상한. 행사가 이보다 많아질 일은 당분간 없지만, 넘으면 조용히 잘리므로
// 명시해서 "여기까지"를 눈에 보이게 둔다.
const MAX_EVENTS = 1000

// 목록·달력·북마크. 북마크는 개인 화면이라 색인 가치가 없어 뺀다.
const STATIC_PATHS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/calendar', changefreq: 'daily', priority: '0.8' },
]

export async function onRequest({ env, request }) {
  const origin = new URL(request.url).origin
  const events = await fetchEvents(env)

  const urls = [
    ...STATIC_PATHS.map(p => ({ loc: `${origin}${p.path}`, changefreq: p.changefreq, priority: p.priority })),
    ...events.map(e => ({
      loc: `${origin}/events/${encodeURIComponent(e.id)}`,
      // 끝난 행사는 내용이 더 바뀌지 않는다. 봇에게 매일 다시 오라고 할 이유가 없다.
      lastmod: e.updated_at?.slice(0, 10),
      changefreq: isPast(e) ? 'yearly' : 'daily',
      priority: isPast(e) ? '0.3' : '0.7',
    })),
  ]

  return new Response(buildXml(urls), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  })
}

function isPast(event) {
  const end = event.end_date ?? event.start_date
  return typeof end === 'string' && end < new Date().toISOString().slice(0, 10)
}

async function fetchEvents(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return []
  const url = `${env.SUPABASE_URL}/rest/v1/events` +
    `?select=id,start_date,end_date,updated_at&order=start_date.desc&limit=${MAX_EVENTS}`
  try {
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows.filter(r => r?.id) : []
  } catch {
    // 조회가 실패해도 정적 경로만 담은 사이트맵은 내보낸다 — 500을 주면 봇이 사이트맵
    // 자체를 한동안 다시 안 읽는다.
    return []
  }
}

// XML에서 특별한 뜻을 갖는 다섯 글자. 행사 id는 우리가 만든 값이라 안전하지만,
// 이 함수가 값에 따라 깨지지 않는다는 걸 눈으로 확인할 수 있게 거쳐 보낸다.
function esc(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildXml(urls) {
  const body = urls.map(u => [
    '  <url>',
    `    <loc>${esc(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${esc(u.lastmod)}</lastmod>` : null,
    u.changefreq ? `    <changefreq>${esc(u.changefreq)}</changefreq>` : null,
    u.priority ? `    <priority>${esc(u.priority)}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}
