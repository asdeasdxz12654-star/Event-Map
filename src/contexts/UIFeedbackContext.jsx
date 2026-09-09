import { createContext, useCallback, useContext, useRef, useState } from 'react'

// 브라우저 네이티브 alert()/confirm()는 메인 스레드를 막고, 스타일도 앱과
// 전혀 안 맞아서 다른 최신 사이트들과 나란히 두면 확 티가 난다. 토스트 +
// 커스텀 확인 모달로 교체하기 위한 공용 컨텍스트.
const Ctx = createContext(null)

let idSeq = 0

export function UIFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const resolveRef = useRef(null)

  const dismiss = useCallback((id) => {
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, { type = 'error', duration = 4000 } = {}) => {
    const id = ++idSeq
    setToasts(current => [...current, { id, message, type }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  // confirm(message) -> Promise<boolean> — window.confirm과 같은 사용법이되 논블로킹.
  const confirmDialog = useCallback((message, { confirmLabel = '삭제', danger = true } = {}) => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setConfirmState({ message, confirmLabel, danger })
    })
  }, [])

  const closeConfirm = (result) => {
    setConfirmState(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }

  return (
    <Ctx.Provider value={{ toast, confirm: confirmDialog }}>
      {children}

      {/* 토스트 스택 */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center px-4 w-full max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto w-full px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border backdrop-blur ${
              t.type === 'error'
                ? 'bg-red-950/90 border-red-500/40 text-red-200'
                : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* 확인 모달 */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-white text-sm mb-5 whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  confirmState.danger
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useUIFeedback = () => useContext(Ctx)
