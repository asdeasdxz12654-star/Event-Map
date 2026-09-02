import { NavLink } from 'react-router-dom'
import NotificationBell from './NotificationBell'

const tabs = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/calendar', label: '달력', icon: '📅' },
  { to: '/bookmarks', label: '북마크', icon: '⭐' },
  { to: '/cosplayers', label: '코스어', icon: '🎭' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0f0f1a]/90 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
        <span className="font-bold text-white text-lg lg:text-xl tracking-tight">
          🎮 이벤트허브
        </span>
        <nav className="flex items-center gap-1 lg:gap-2">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-sm lg:text-base transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {icon} {label}
            </NavLink>
          ))}
          <NotificationBell />
        </nav>
      </div>
    </header>
  )
}
