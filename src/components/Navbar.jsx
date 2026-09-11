import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import SettingsModal from './SettingsModal'
import { useAdmin } from '../contexts/AdminContext'

const tabs = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/calendar', label: '달력', icon: '📅' },
  { to: '/bookmarks', label: '북마크', icon: '⭐' },
]

export default function Navbar() {
  const [showSettings, setShowSettings] = useState(false)
  const { isAdmin } = useAdmin()

  return (
    <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur border-b border-ink/10">
      {/* 컨테이너 폭은 각 페이지(max-w-2xl lg:max-w-6xl)와 반드시 같게 유지한다 —
          다르면 태블릿 폭에서 로고와 본문 왼쪽 끝이 어긋나 보인다. */}
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
        {/* 로고를 눌러 홈으로 가는 건 거의 모든 사이트의 기본 동작인데 그냥 텍스트였다 */}
        <Link to="/" className="font-bold text-ink text-lg lg:text-xl tracking-tight hover:text-indigo-300 transition-colors">
          🎮 이벤트허브
        </Link>
        <nav className="flex items-center gap-1 lg:gap-2">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              // 좁은 화면에서는 글자를 숨기고 이모지만 남기는데, 그러면 스크린리더에
              // "집 그림" 같은 소리만 읽힌다. 링크 이름을 명시해준다.
              aria-label={label}
              className={({ isActive }) =>
                `px-2 sm:px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-sm lg:text-base transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
                }`
              }
            >
              <span>{icon}</span>
              <span className="hidden sm:inline"> {label}</span>
            </NavLink>
          ))}
          {/* 알림·앱 설치·관리자는 전부 설정 안으로 옮겼다 — 이모지 아이콘만 늘어놓으면
              무슨 기능인지 알 수 없고, 좁은 화면에서 탭과 뒤엉킨다. */}
          <button
            onClick={() => setShowSettings(true)}
            title="설정"
            aria-label="설정"
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
              isAdmin
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
            }`}
          >
            ⚙
          </button>
        </nav>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  )
}
