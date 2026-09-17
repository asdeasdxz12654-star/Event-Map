import { NavLink, Outlet } from 'react-router-dom'
import Icon from '../../components/icons'
import AdminGate from '../../components/admin/AdminGate'
import { useAdmin } from '../../contexts/AdminContext'
import { FOCUS_RING } from '../../components/ui/focusRing'

// /admin/* 의 공통 틀.
//
// 왜 페이지가 아니라 틀을 먼저 만드나
//   지금까지 관리자 화면은 /admin/drafts 한 장이었고, 그 안에 로그인 검사·제목·
//   로그아웃 버튼이 전부 들어 있었다. 화면이 여섯 장이 되면 그 덩어리가 여섯 벌이 되고,
//   한 곳을 고칠 때 나머지 다섯을 빠뜨린다. 문과 뼈대는 한 번만 만든다.
//
// 좌측 메뉴를 쓰는 이유
//   어드민은 "훑어보다 들어가고 다시 나오는" 화면이다. 상단 탭이면 화면이 좁아질수록
//   항목이 가로로 밀려 잘리는데, 세로 목록은 항목이 늘어도 자리가 생긴다.
//   모바일에서는 가로 스크롤 줄로 접는다 — 좁은 화면에서 세로 목록은 본문을 밀어낸다.
const MENU = [
  { to: '/admin', end: true, icon: 'home', label: '대시보드' },
  { to: '/admin/events', icon: 'store', label: '행사 관리' },
  { to: '/admin/drafts', icon: 'list', label: '행사 검수' },
  { to: '/admin/reports', icon: 'warn', label: '제보 · 신고' },
  { to: '/admin/errors', icon: 'warn', label: '앱 오류' },
  { to: '/admin/sources', icon: 'bell', label: '소스 감시' },
]

export default function AdminLayout() {
  return (
    <AdminGate title="관리자">
      <AdminShell />
    </AdminGate>
  )
}

function AdminShell() {
  const { logout } = useAdmin()

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold text-ink tracking-tight">관리자</h1>
        <button
          type="button"
          onClick={logout}
          className={`text-sm text-zinc-400 hover:text-ink transition-colors rounded ${FOCUS_RING}`}
        >
          관리자 모드 종료
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-8 lg:items-start">
        <nav
          aria-label="관리자 메뉴"
          className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-hide
            border-b lg:border-b-0 border-line mb-5 lg:mb-0 -mx-4 px-4 lg:mx-0 lg:px-0
            lg:sticky lg:top-20"
        >
          {MENU.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 flex items-center gap-2 px-3 py-2.5 lg:py-2 text-sm whitespace-nowrap
                 rounded-none lg:rounded-xl border-b-2 lg:border-b-0 -mb-px lg:mb-0
                 transition-colors ${FOCUS_RING} ${
                  isActive
                    ? 'border-indigo-500 text-ink font-semibold lg:bg-surface-2'
                    : 'border-transparent text-zinc-400 hover:text-ink'
                }`
              }
            >
              <Icon name={item.icon} className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
