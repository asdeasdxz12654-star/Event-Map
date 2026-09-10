import { useEffect, useState } from 'react'

// 홈 화면에 웹앱으로 설치하기 위한 상태를 다룬다. (예전 InstallAppButton 컴포넌트에서
// 분리 — 지금은 설정 화면 한 줄로 들어가 있다.)
//
// 안드로이드 크롬·삼성 인터넷은 설치 조건을 만족하면 beforeinstallprompt 이벤트를 주는데,
// 그걸 잡아두지 않으면 브라우저가 알아서 띄우는 작은 배너에만 의존하게 된다(잘 안 보이고
// 한 번 닫으면 한참 안 뜬다). 이벤트를 보관했다가 사용자가 누를 때 프롬프트를 띄운다.
//
// iOS 사파리는 이 이벤트가 아예 없고 "공유 → 홈 화면에 추가"만 가능해서, 같은 자리에서
// 안내 문구를 보여준다(canInstall이 false, isIos가 true인 경우).
//
// beforeinstallprompt는 앱 스크립트가 실행되기 전에 발생할 수 있어서, main.jsx에서 미리
// 잡아 window에 넣어둔 값을 함께 확인한다.

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true // iOS 사파리
  )
}

export function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+는 UA가 매킨토시로 나와서 터치 지원 여부로 함께 판별한다.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(() => window.__deferredInstallPrompt ?? null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = e => {
      e.preventDefault()
      window.__deferredInstallPrompt = e
      setPromptEvent(e)
    }
    const onDeferred = () => setPromptEvent(window.__deferredInstallPrompt ?? null)
    const onInstalled = () => {
      window.__deferredInstallPrompt = null
      setPromptEvent(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('install-prompt-ready', onDeferred) // main.jsx가 미리 잡은 경우
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('install-prompt-ready', onDeferred)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    // 한 번 쓴 프롬프트는 재사용할 수 없다.
    window.__deferredInstallPrompt = null
    setPromptEvent(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  return { installed, canInstall: !!promptEvent, install }
}
