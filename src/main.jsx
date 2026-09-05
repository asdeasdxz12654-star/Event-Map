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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
