import { useRef, useState } from 'react'
import Icon from './icons'
import { useAdmin } from '../contexts/AdminContext'
import { useModalDialog } from '../hooks/useModalDialog'

export default function AdminModal({ onClose }) {
  const { isAdmin, authenticate, logout } = useAdmin()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef()

  // 이 모달만 아무것도 갖추지 못하고 있었다 — Esc도, 스크롤 잠금도, 트랩도 없었다.
  // 설정 모달 위에 뜨는데 Esc는 아래에 깔린 설정이 받아서, 코드를 잘못 치고 Esc를
  // 누르면 관리자 창이 아니라 설정 전체가 닫혔다.
  // 열리면 비밀번호 칸으로 바로 간다 — 이 창은 그거 하나 치라고 뜬다.
  // (isAdmin이면 입력칸이 없으므로 훅이 알아서 첫 요소로 보낸다.)
  const panelRef = useRef(null)
  useModalDialog(panelRef, onClose, { initialFocusRef: inputRef })

  const submit = async (e) => {
    e.preventDefault()
    if (!pw) return
    setLoading(true)
    setError('')
    const { ok, message } = await authenticate(pw)
    setLoading(false)
    if (ok) {
      onClose()
    } else {
      setError(message ?? '관리자 코드가 올바르지 않습니다')
      setPw('')
      inputRef.current?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="관리자"
        className="bg-panel border border-line rounded-2xl p-6 w-80 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-ink font-semibold text-sm">관리자</h2>
          <button onClick={onClose} aria-label="닫기" className="text-zinc-400 hover:text-ink text-xl leading-none">×</button>
        </div>

        {isAdmin ? (
          <div>
            <p className="flex items-center gap-1.5 text-live text-sm mb-4"><Icon name="check" className="w-4 h-4" />관리자 모드 활성화됨</p>
            <p className="text-zinc-400 text-xs mb-4">행사 추가·수정·삭제 기능이 활성화되었습니다.</p>
            <button
              onClick={() => { logout(); onClose() }}
              className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl text-sm transition-colors"
            >
              관리자 모드 종료
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <input
              ref={inputRef}
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="관리자 코드 입력"
              autoComplete="new-password"
              className="w-full bg-surface-2 border border-line focus:border-indigo-500 rounded-xl px-4 py-2.5 text-ink placeholder:text-zinc-600 focus:outline-none text-sm mb-3 tracking-widest"
            />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              type="submit"
              disabled={loading || !pw}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {loading ? '확인 중...' : '확인'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
