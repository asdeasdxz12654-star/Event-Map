import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const isGithubPages = process.env.GITHUB_PAGES === 'true'
const base = isGithubPages ? '/Event-Map/' : '/'

// og:url·og:image는 절대 URL이어야 해서 index.html에 도메인을 박아둘 수밖에 없는데,
// 같은 코드가 GitHub Pages와 Cloudflare Pages 양쪽에 배포되다 보니 한쪽에 맞춰두면
// 다른 쪽에서 공유했을 때 미리보기가 엉뚱한 사이트를 가리킨다. 빌드 대상에 맞는 값을
// 여기서 주입한다. (VITE_SITE_URL로 덮어쓸 수 있음)
const siteUrl =
  process.env.VITE_SITE_URL ??
  (isGithubPages ? 'https://asdeasdxz12654-star.github.io/Event-Map/' : 'https://event-map.pages.dev/')

// index.html의 %SITE_URL% 자리를 위 값으로 바꾼다.
function siteUrlPlugin() {
  return {
    name: 'inject-site-url',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl)
    },
  }
}

// GitHub Pages에 SPA 딥링크 폴백(404.html)을 같이 올린다.
//
// 무엇이 깨져 있었나
//   GitHub Pages는 파일만 내려주는 정적 서버다. /Event-Map/events/nd-xxx 같은 주소에는
//   그런 이름의 파일이 없으니 깃허브 기본 404 화면이 뜬다. 앱 안에서 카드를 눌러 이동할
//   때는 라우터가 처리하니 멀쩡해 보이지만, 주소를 공유받아 처음 들어오는 사람은
//   행사 페이지를 아예 못 본다 — 공유가 핵심인 서비스에서 가장 나쁜 경우다.
//
//   서비스워커에 navigateFallback이 걸려 있어서 한 번이라도 방문한 사람은 괜찮다.
//   그래서 우리 눈에는 멀쩡하고 처음 오는 사람만 깨진다. 알아채기 어려웠던 이유다.
//
// 해법
//   빌드 결과의 index.html을 404.html로 한 벌 더 둔다. 없는 주소를 요청하면 GitHub Pages가
//   이 파일을 내주고, 그 안의 라우터가 주소를 보고 알맞은 화면을 그린다.
//   Cloudflare Pages는 public/_redirects가 같은 일을 하므로 그쪽엔 필요 없다.
//
//   단, 이 응답의 상태 코드는 200이 아니라 404로 남는다. 사람이 보기엔 정상이지만
//   카카오톡·트위터 링크 미리보기 봇은 404를 보고 미리보기를 안 만들 수 있다.
//   공유·홍보용 주소로는 여전히 Cloudflare 쪽이 낫다(public/_headers의 메모와 같은 이유).
//   워크박스 프리캐시에서는 빼둔다(아래 globIgnores). VitePWA는 플러그인 배열에서
//   어디에 두든 마지막에 돌기 때문에 순서로는 피할 수 없고, 그냥 두면 index.html과
//   바이트까지 같은 파일이 캐시에 두 벌 들어간다. 서비스워커는 내비게이션을 이미
//   index.html로 폴백시키므로 404.html은 애초에 워커가 쓸 일이 없다.
function githubPagesFallbackPlugin() {
  let outDir = 'dist'
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    // generateBundle이 아니라 closeBundle이다 — 그 시점엔 index.html이 아직 번들에
    // 들어와 있지 않다(Vite가 HTML을 나중에 낸다). 파일이 다 써진 뒤에 복사한다.
    closeBundle() {
      if (!isGithubPages) return
      const index = resolve(outDir, 'index.html')
      // 못 찾으면 빌드를 세운다. 폴백이 조용히 빠진 채 배포되면 다시 "처음 오는 사람만
      // 깨지는" 상태로 돌아가는데, 그건 로그로도 안 보인다.
      if (!existsSync(index)) {
        this.error('index.html을 찾지 못해 404.html 폴백을 만들 수 없습니다')
      }
      copyFileSync(index, resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    siteUrlPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        // id를 고정해두면 start_url이 바뀌어도 브라우저가 같은 앱으로 인식한다
        // (설치된 앱이 중복 등록되지 않음).
        id: base,
        name: '게임이벤트허브',
        short_name: '이벤트허브',
        description: '국내 게임·코스프레·게임음악 행사 통합 정보 플랫폼',
        lang: 'ko',
        dir: 'ltr',
        categories: ['entertainment', 'events'],
        orientation: 'portrait',
        theme_color: '#6366f1',
        background_color: '#0f0f1a',
        display: 'standalone',
        // display_override: 지원하는 브라우저(삼성 인터넷 등)에서 더 앱다운 표시 모드를
        // 먼저 시도하고, 안 되면 standalone으로 떨어진다.
        display_override: ['standalone', 'minimal-ui'],
        scope: base,
        start_url: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // FCM 서비스워커는 별도 스코프로 직접 등록해서 쓰는 것이라 오프라인 프리캐시 대상이 아님
        globIgnores: ['firebase-messaging-sw.js', '404.html'],
      },
    }),
    githubPagesFallbackPlugin(),
  ],
})
