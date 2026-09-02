import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '홈', icon: '🏠' },
  { to: '/calendar', label: '달력', icon: '📅' },
  { to: '/bookmarks', label: '북마크', icon: '⭐' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0f0f1a]/90 backdrop-blur border-b border-white/10">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-white text-lg tracking-tight">
          🎮 이벤트허브
        </span>
        <nav className="flex gap-1">
          {tabs.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {icon} {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
