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
  // onClose는 호출부에서 대개 인라인 화살표 함수로 온다 — 부모가 다시 그릴 때마다
  // 새 함수가 되므로, 이걸 의존성에 넣으면 아래 이펙트가 매 렌더 다시 돈다.
  // 그러면 정리 단계가 포커스를 시트 밖(열었던 버튼)으로 보내고 설정 단계가 다시
  // 시트 안 첫 요소로 가져와서, 시트 안에서 스위치 하나 누를 때마다 포커스가 튄다.
  // 실제로 홈 필터 시트에서 "매진 숨기기"를 켜면 그 자리에서 포커스를 잃었다.
  // 이펙트는 열릴 때 한 번만 돌리고, 최신 onClose는 ref로 읽는다.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    openerRef.current = document.activeElement

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
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
    // 의존성은 비워 둔다 — 열릴 때 한 번만 잠그고 닫힐 때 한 번만 되돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
