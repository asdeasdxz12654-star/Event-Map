import { useEffect, useRef, useState } from 'react'
import Icon, { StarFilled } from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { useAdmin } from '../contexts/AdminContext'
import { useBookmarks } from '../hooks/useBookmarks'

// 상세 화면 오른쪽 위의 조작.
//
// 예전엔 북마크(누구나 쓰는 기능)와 수정·삭제(관리자만 보이는 기능)가 같은 크기의
// 9×9 버튼 세 개로 나란히 붙어 있었다. 성격이 다른 것이 같은 무게로 놓이면
// "이 별표도 위험한 버튼인가?" 싶어진다.
// 북마크는 그대로 밖에 두고, 관리자 기능은 ⋯ 메뉴 안으로 넣었다.
export default function EventActions({ event, onEdit, onDelete, overlay = false }) {
  const { isAdmin } = useAdmin()
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef(null)
  const bookmarked = isBookmarked(event.id)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = e => {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // 포스터 위에 얹힐 때(overlay)는 어떤 그림 위에서도 보여야 해서 어두운 반투명 원이고,
  // 본문 안에 놓일 때는 주변 면과 같은 톤을 쓴다.
  const btn = overlay
    ? 'w-10 h-10 rounded-full bg-black/45 backdrop-blur border border-white/15 text-white hover:bg-black/60'
    : 'w-10 h-10 rounded-xl bg-surface-1 border border-line text-zinc-400 hover:text-ink'

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => toggleBookmark(event.id)}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? '북마크 해제' : '북마크에 추가'}
        className={`flex items-center justify-center transition-colors ${FOCUS_RING} ${
          bookmarked
            ? overlay
              ? 'w-10 h-10 rounded-full bg-indigo-600/90 border border-white/15 text-white'
              : 'w-10 h-10 rounded-xl bg-indigo-600/90 border border-indigo-500/50 text-white'
            : btn
        }`}
      >
        {bookmarked ? <StarFilled className="w-[18px] h-[18px]" /> : <Icon name="star" className="w-[18px] h-[18px]" />}
      </button>

      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="관리자 메뉴"
            className={`flex items-center justify-center transition-colors ${FOCUS_RING} ${btn}`}
          >
            <Icon name="more" className="w-[18px] h-[18px]" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1.5 z-30 w-36 py-1 bg-panel border border-line rounded-xl shadow-2xl animate-fade-in"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onEdit() }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-ink/10 transition-colors ${FOCUS_RING}`}
              >
                <Icon name="edit" className="w-4 h-4 text-zinc-400" />
                행사 수정
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onDelete() }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors ${FOCUS_RING}`}
              >
                <Icon name="trash" className="w-4 h-4" />
                행사 삭제
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
