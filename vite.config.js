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
        globIgnores: ['firebase-messaging-sw.js'],
      },
    }),
  ],
})
