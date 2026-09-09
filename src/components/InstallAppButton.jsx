import { useEffect, useState } from 'react'

// 홈 화면에 웹앱으로 설치하는 버튼.
//
// 안드로이드 크롬·삼성 인터넷은 설치 조건을 만족하면 beforeinstallprompt 이벤트를 주는데,
// 그걸 잡아두지 않으면 브라우저가 알아서 띄우는 작은 배너에만 의존하게 된다(잘 안 보이고
// 한 번 닫으면 한참 안 뜬다). 이벤트를 보관했다가 사용자가 버튼을 누를 때 프롬프트를 띄운다.
//
// iOS 사파리는 이 이벤트가 아예 없고 "공유 → 홈 화면에 추가"만 가능해서, 같은 자리에서
// 안내 문구를 보여준다.
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

function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+는 UA가 매킨토시로 나와서 터치 지원 여부로 함께 판별한다.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState(() => window.__deferredInstallPrompt ?? null)
  const [installed, setInstalled] = useState(isStandalone)
  const [showIosGuide, setShowIosGuide] = useState(false)

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

  if (installed) return null

  const ios = isIos()
  if (!promptEvent && !ios) return null

  return (
    <>
      <button
        onClick={() => (ios && !promptEvent ? setShowIosGuide(true) : install())}
        aria-label="홈 화면에 앱으로 설치"
        title="홈 화면에 앱으로 설치"
        className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 text-sm transition-colors"
      >
        📲
      </button>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="홈 화면에 추가하는 방법"
            className="bg-[#1a1a2e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:w-80 shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">홈 화면에 추가</h2>
              <button
                onClick={() => setShowIosGuide(false)}
                aria-label="닫기"
                className="text-zinc-500 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>
            <ol className="text-sm text-zinc-300 space-y-2.5">
              <li>1. 사파리 아래쪽 <span className="text-white">공유 버튼(⬆)</span>을 누르세요</li>
              <li>2. 메뉴를 내려서 <span className="text-white">&quot;홈 화면에 추가&quot;</span>를 선택하세요</li>
              <li>3. 오른쪽 위 <span className="text-white">&quot;추가&quot;</span>를 누르면 끝입니다</li>
            </ol>
            <p className="text-xs text-zinc-500 mt-4">
              앱처럼 전체 화면으로 열리고, 알림도 받을 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
