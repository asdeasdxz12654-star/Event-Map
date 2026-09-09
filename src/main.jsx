import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Firebase Performance SDK(web-vitals 내장)가 SPA 페이지 전환 시
// undefined PerformanceEntry의 startTime을 읽으려다 던지는 내부 에러를 억제한다.
// 앱 동작에는 영향 없는 Firebase 12.x 알려진 버그 — Firebase 패치 후 제거 가능.
window.addEventListener('error', e => {
  if (e?.error?.stack?.includes('reportAllChanges')) e.preventDefault()
})

// 설치 프롬프트(beforeinstallprompt)는 React가 마운트되기 전에 발생할 수 있다.
// 여기서 먼저 잡아 보관해두고, InstallAppButton이 그 값을 받아 쓴다.
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  window.__deferredInstallPrompt = e
  window.dispatchEvent(new Event('install-prompt-ready'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
