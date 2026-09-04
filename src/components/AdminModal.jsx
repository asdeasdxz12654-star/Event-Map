import { useRef, useState } from 'react'
import { useAdmin } from '../contexts/AdminContext'

export default function AdminModal({ onClose }) {
  const { isAdmin, authenticate, logout } = useAdmin()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef()

  const submit = async (e) => {
    e.preventDefault()
    if (!pw) return
    setLoading(true)
    setError('')
    const ok = await authenticate(pw)
    setLoading(false)
    if (ok) {
      onClose()
    } else {
      setError('관리자 코드가 올바르지 않습니다')
      setPw('')
      inputRef.current?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-sm">관리자</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {isAdmin ? (
          <div>
            <p className="text-emerald-400 text-sm mb-4">✓ 관리자 모드 활성화됨</p>
            <p className="text-zinc-500 text-xs mb-4">행사 추가·수정·삭제 기능이 활성화되었습니다.</p>
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
              autoFocus
              className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none text-sm mb-3 tracking-widest"
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
