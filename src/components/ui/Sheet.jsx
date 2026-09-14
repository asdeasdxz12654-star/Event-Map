import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../icons'
import { FOCUS_RING } from './focusRing'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 아래에서 올라오는 시트. 좁은 화면에서는 화면 하단에 붙고, 넓은 화면에서는
// 가운데 뜨는 패널이 된다 — 같은 내용을 두 번 만들지 않기 위해서다.
//
// 모달이 갖춰야 할 것들을 여기서 한 번만 처리한다:
//   · 열려 있는 동안 뒤 배경이 스크롤되지 않게 잠근다
//   · Esc로 닫힌다
//   · 탭 키가 시트 밖으로 나가지 않는다(포커스 트랩)
//   · 닫으면 열었던 버튼으로 포커스가 돌아간다 — 안 그러면 키보드 사용자는
//     닫은 뒤 페이지 맨 위에서 다시 시작해야 한다
export default function Sheet({ title, onClose, children, footer }) {
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    openerRef.current = document.activeElement

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (!items?.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // 열리자마자 시트 안으로 포커스를 옮긴다.
    panelRef.current?.querySelector(FOCUSABLE)?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      openerRef.current?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="w-full sm:w-[26rem] max-h-[85svh] overflow-y-auto bg-panel border-t sm:border border-line
          rounded-t-2xl sm:rounded-2xl shadow-2xl animate-sheet-in
          pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
      >
        {/* 손잡이 — 좁은 화면에서 "아래에서 올라온 것"임을 알리는 표시 */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-ink hover:bg-ink/10 transition-colors ${FOCUS_RING}`}
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-2">{children}</div>

        {footer && <div className="px-4 pt-2 sticky bottom-0 bg-panel">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
