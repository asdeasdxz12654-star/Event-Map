import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { isSupabaseConfigured } from './supabase'
import Icon from './components/icons'
import { installErrorReporter } from './lib/errorReporter'

// 방문자 화면에서 난 오류를 우리에게 알린다. 여기서 가장 먼저 켠다 — 아래 리스너들과
// 앱 부팅 자체에서 나는 오류까지 잡으려면 첫 줄이어야 한다.
installErrorReporter()

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

// Supabase 설정이 없으면 앱을 띄우지 않고 왜 안 되는지 알린다. 예전엔 supabase.js가
// 모듈 평가 단계에서 예외를 던져 화면이 그냥 백지였다 — ErrorBoundary는 React가 뜬 뒤에나
// 동작하므로 이 단계의 실패는 잡지 못한다.
function ConfigMissing() {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <Icon name="gear" className="w-12 h-12 mx-auto mb-4 text-zinc-500" />
      <h1 className="text-xl font-bold text-ink mb-2">설정이 완료되지 않았습니다</h1>
      <p className="text-zinc-400 text-sm">
        VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY 환경변수가 없어서 행사 정보를 불러올 수 없습니다.
        로컬에서는 .env(.env.example 참고), 배포에서는 빌드 환경변수를 확인해 주세요.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isSupabaseConfigured ? <App /> : <ConfigMissing />}
  </StrictMode>,
)
