// GitHub Pages는 클라이언트 사이드 라우팅을 모른다 — 정적 파일 서버라 /calendar 같은 경로로
// 직접 접속하거나 새로고침하면 실제로 그 경로에 파일이 없어서 GitHub의 기본 404 페이지가 뜬다
// (React Router가 아예 실행되지 못함). 표준 우회법은 dist/index.html을 dist/404.html로 그대로
// 복사해두는 것 — GitHub Pages는 경로를 못 찾으면 404.html을 서빙하는데, 그 내용이 index.html과
// 같으니 결국 앱이 로드되고 React Router가 window.location의 실제 경로를 읽어 올바른 화면을
// 그린다. build 후 자동 실행: package.json의 "build" 스크립트 참고.
//
// 단, 이 파일은 GitHub Pages 빌드에서만 만든다. Cloudflare Pages는 404.html이 있으면 그걸
// "404 상태"로 서빙해버려서, public/_redirects의 `/* /index.html 200` 리라이트가 무시된다.
// 그러면 /events/:id 같은 링크가 화면은 정상이어도 HTTP 404로 응답해서 검색엔진·카카오톡
// 링크 미리보기 봇이 페이지가 없는 것으로 처리한다. 404.html이 없으면 _redirects가 적용돼
// 정상적으로 200을 준다.
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'dist')
const src = join(distDir, 'index.html')
const dest = join(distDir, '404.html')

if (!existsSync(src)) {
  console.error('dist/index.html이 없습니다 — vite build를 먼저 실행하세요.')
  process.exit(1)
}

if (process.env.GITHUB_PAGES !== 'true') {
  console.log('GitHub Pages 빌드가 아니므로 404.html을 만들지 않습니다 (_redirects가 SPA 폴백을 담당).')
  process.exit(0)
}

copyFileSync(src, dest)
console.log('wrote dist/404.html (index.html 복사본, GitHub Pages SPA 폴백용)')
