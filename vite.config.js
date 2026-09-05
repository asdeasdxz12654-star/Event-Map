import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_PAGES === 'true' ? '/Event-Map/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: '게임이벤트허브',
        short_name: '이벤트허브',
        description: '국내 게임·코스프레·게임음악 행사 통합 정보 플랫폼',
        theme_color: '#6366f1',
        background_color: '#0f0f1a',
        display: 'standalone',
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
