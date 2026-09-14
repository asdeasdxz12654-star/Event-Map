import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import SettingsModal from './SettingsModal'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { useAdmin } from '../contexts/AdminContext'

const tabs = [
  { to: '/', label: '홈', icon: 'home' },
  { to: '/calendar', label: '달력', icon: 'calendar' },
  { to: '/bookmarks', label: '북마크', icon: 'star' },
]

export default function Navbar() {
  const [showSettings, setShowSettings] = useState(false)
  const { isAdmin } = useAdmin()

  return (
    <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur border-b border-line">
      {/* 컨테이너 폭은 각 페이지(max-w-2xl lg:max-w-6xl)와 반드시 같게 유지한다 —
          다르면 태블릿 폭에서 로고와 본문 왼쪽 끝이 어긋나 보인다. */}
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
        {/* 로고를 눌러 홈으로 가는 건 거의 모든 사이트의 기본 동작인데 그냥 텍스트였다 */}
        <Link
          to="/"
          className={`font-bold text-ink text-lg lg:text-xl tracking-tight hover:text-indigo-300 transition-colors rounded-lg ${FOCUS_RING}`}
        >
          이벤트허브
        </Link>
        <nav className="flex items-center gap-0.5 lg:gap-1">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              // 좁은 화면에서는 글자를 숨기고 아이콘만 남기므로 링크 이름을 명시해준다.
              aria-label={label}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-2.5 sm:px-3 lg:px-4 h-9 lg:h-10 rounded-lg text-sm lg:text-base transition-colors ${FOCUS_RING} ${
                  isActive
                    ? 'bg-surface-2 text-ink font-medium'
                    : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
                }`
              }
            >
              <Icon name={icon} className="w-[18px] h-[18px]" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
          {/* 알림·앱 설치·관리자는 전부 설정 안으로 옮겼다 — 아이콘만 늘어놓으면
              무슨 기능인지 알 수 없고, 좁은 화면에서 탭과 뒤엉킨다. */}
          <button
            onClick={() => setShowSettings(true)}
            title="설정"
            aria-label="설정"
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${FOCUS_RING} ${
              isAdmin
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
            }`}
          >
            <Icon name="gear" className="w-[18px] h-[18px]" />
          </button>
        </nav>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  )
}
