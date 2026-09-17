import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// 정식 주소(canonical)를 지금 보고 있는 경로에 맞춘다.
//
// 왜 필요한가
//   같은 사이트가 두 도메인에 올라가 있다 — Cloudflare(정식)와 GitHub Pages(미러).
//   어느 쪽이 진짜인지 말해주지 않으면 검색엔진에게는 같은 내용이 두 벌 있는 중복
//   콘텐츠이고, 검색엔진이 알아서 하나를 고른다.
//
//   index.html에 canonical을 하나 박아둘 수는 있지만 그건 홈 주소뿐이다. SPA는 주소가
//   바뀌어도 HTML이 그대로라, 행사 상세를 열어도 canonical은 여전히 홈을 가리킨다 —
//   "이 페이지들은 전부 홈페이지입니다"라고 말하는 셈이라 안 하느니만 못하다.
//
// 서버 쪽과 겹치는 부분
//   Cloudflare의 functions/events/[id].js가 /events/:id 요청에는 서버에서 canonical을
//   박아준다(JS를 안 돌리는 봇을 위해). 여기서 다시 맞추는 값은 그것과 같아야 하므로
//   규칙을 한 줄로 단순하게 둔다 — 정식 오리진 + 경로.
//
// ScrollRestoration과 같은 모양이다 — 라우터 안에서 부수효과만 내고 아무것도 안 그린다.
const CANONICAL_ORIGIN = 'https://event-map.pages.dev'

export default function CanonicalLink() {
  const { pathname } = useLocation()

  useEffect(() => {
    // GitHub Pages는 /Event-Map/ 아래에 올라간다. 정식 주소는 그 접두사가 없으므로 뗀다.
    // (BASE_URL은 Cloudflare에서 '/'라 이 replace가 아무것도 안 바꾼다.)
    const base = import.meta.env.BASE_URL
    const path = base !== '/' && pathname.startsWith(base)
      ? pathname.slice(base.length - 1)
      : pathname

    const href = `${CANONICAL_ORIGIN}${path === '/' ? '/' : path}`

    let link = document.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = href
  }, [pathname])

  return null
}
