import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { useBookmarks } from '../hooks/useBookmarks'
import { useInstallPrompt, isIos } from '../hooks/useInstallPrompt'
import { useListColumns } from '../hooks/useListColumns'
import { usePushNotifications } from '../hooks/usePushNotifications'
import AdminModal from './AdminModal'

// 설정 화면.
//
// 예전엔 알림(🔔)·앱 설치(📲)·관리자(⚙) 버튼이 각각 상단 바에 아이콘으로 붙어 있었다.
// 이모지만 있는 아이콘 세 개는 무슨 기능인지 알기 어렵고, 화면이 좁을수록 탭 영역과
// 뒤엉킨다. 설정 한 곳에 이름과 설명을 붙여 모았다.

function Row({ icon, title, description, children }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className="text-lg leading-none mt-0.5 w-6 text-center shrink-0" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium">{title}</p>
        {description && <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      {children && <div className="shrink-0 self-center">{children}</div>}
    </div>
  )
}

const actionClass =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
const quietClass =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10'

function NotificationRow() {
  const { supported, permission, subscribed, loading, error, subscribe } = usePushNotifications()

  // 지원 여부를 확인하는 동안에는 줄을 비워두지 않고 "확인 중"으로 둔다 — 줄이 나중에
  // 튀어나오면 설정 화면이 흔들린다.
  const description =
    supported === null ? '지원 여부 확인 중...'
      : supported === false ? '이 브라우저에서는 웹 푸시를 지원하지 않습니다'
      : permission === 'denied' ? '브라우저 설정에서 이 사이트의 알림이 차단되어 있습니다'
      : subscribed ? '예매 오픈·행사 시작 하루 전에 알려드려요'
      : error ? '알림 설정에 실패했습니다. 잠시 후 다시 시도해 주세요'
      : '예매 오픈일과 행사 하루 전에 알림을 받습니다'

  return (
    <Row icon="🔔" title="행사 알림" description={description}>
      {supported === true && permission !== 'denied' && (
        subscribed
          ? <span className="text-xs text-emerald-400 font-medium">받는 중</span>
          : <button onClick={subscribe} disabled={loading} className={actionClass}>
              {loading ? '설정 중...' : '받기'}
            </button>
      )}
    </Row>
  )
}

function InstallRow({ onShowIosGuide }) {
  const { installed, canInstall, install } = useInstallPrompt()
  const ios = isIos()

  if (installed) {
    return <Row icon="📲" title="앱으로 설치" description="이미 홈 화면에서 실행 중입니다">
      <span className="text-xs text-emerald-400 font-medium">설치됨</span>
    </Row>
  }

  // 설치 프롬프트도 없고 iOS도 아니면(데스크톱 브라우저 등) 안내할 게 없다.
  if (!canInstall && !ios) return null

  return (
    <Row icon="📲" title="앱으로 설치" description="홈 화면에 추가하면 주소창 없이 앱처럼 열립니다">
      <button onClick={canInstall ? install : onShowIosGuide} className={actionClass}>
        {canInstall ? '설치' : '방법 보기'}
      </button>
    </Row>
  )
}

function ListColumnsRow() {
  const [columns, setColumns] = useListColumns()
  return (
    <Row icon="▤" title="목록 보기" description="좁은 화면에서 행사 카드를 몇 개씩 보여줄지 정합니다">
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        {[{ value: 1, label: '크게' }, { value: 2, label: '두 개씩' }].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setColumns(value)}
            aria-pressed={columns === value}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${value === 2 ? 'border-l border-white/10' : ''} ${
              columns === value ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Row>
  )
}

function BookmarkRow() {
  const { bookmarkIds, clearBookmarks } = useBookmarks()
  const { confirm, toast } = useUIFeedback()

  const clear = async () => {
    if (!await confirm(`북마크한 행사 ${bookmarkIds.length}개를 모두 지울까요?`)) return
    clearBookmarks()
    toast('북마크를 모두 지웠습니다', { type: 'success' })
  }

  return (
    <Row
      icon="⭐"
      title="북마크"
      description={bookmarkIds.length > 0
        ? `${bookmarkIds.length}개 저장됨 · 이 기기에만 저장됩니다`
        : '관심 있는 행사를 북마크하면 여기 표시됩니다'}
    >
      {bookmarkIds.length > 0 && (
        <button onClick={clear} className={quietClass}>전체 삭제</button>
      )}
    </Row>
  )
}

function AdminRow({ onOpenAdmin }) {
  const { isAdmin, logout } = useAdmin()
  return (
    <Row
      icon="🔑"
      title="관리자"
      description={isAdmin ? '행사 추가·수정·삭제가 켜져 있습니다' : '행사 정보를 직접 고치려면 로그인하세요'}
    >
      {isAdmin
        ? <button onClick={logout} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors">종료</button>
        : <button onClick={onOpenAdmin} className={quietClass}>로그인</button>}
    </Row>
  )
}

export default function SettingsModal({ onClose }) {
  const [showAdmin, setShowAdmin] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  // Esc로 닫기 + 열려 있는 동안 뒤 화면 스크롤 잠금. 시트가 떠 있는데 뒤가 같이 굴러가면
  // 모바일에서 뭘 만지고 있는지 헷갈린다.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // 이 모달은 Navbar 안에서 열리는데, 그 헤더에 backdrop-blur가 걸려 있다.
  // backdrop-filter가 있는 요소는 fixed 자식의 기준 상자가 되기 때문에, 그냥 두면
  // "화면 전체"가 아니라 "높이 56px짜리 헤더"를 기준으로 배치돼 시트가 화면 위로 잘려
  // 나간다. body에 직접 그려서 화면 기준으로 되돌린다.
  return createPortal(
    <>
      {/* 모바일은 아래에서 올라오는 시트, PC는 가운데 모달 */}
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="설정"
          className="bg-[#1a1a2e] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:w-96 max-h-[85vh] overflow-y-auto shadow-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-[#1a1a2e] flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
            <h2 className="text-white font-semibold">설정</h2>
            <button onClick={onClose} aria-label="닫기" className="text-zinc-400 hover:text-white text-2xl leading-none">×</button>
          </div>

          <div className="px-5 divide-y divide-white/5">
            <NotificationRow />
            <InstallRow onShowIosGuide={() => setShowIosGuide(true)} />
            <ListColumnsRow />
            <BookmarkRow />
            <AdminRow onOpenAdmin={() => setShowAdmin(true)} />
          </div>

          <div className="px-5 pt-4 text-[11px] leading-relaxed text-zinc-500">
            국내 게임·코스프레·게임음악·일러스트 행사를 공식 사이트와 공공 API에서 모아 보여줍니다.
            포스터는 주최 측이 공개한 공식 홍보물만 씁니다 — 아직 안 나온 행사는 &quot;공식 포스터 미정&quot;으로 표시됩니다.
          </div>
        </div>
      </div>

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}

      {showIosGuide && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="홈 화면에 추가하는 방법"
            className="bg-[#1a1a2e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:w-80 shadow-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">홈 화면에 추가</h2>
              <button onClick={() => setShowIosGuide(false)} aria-label="닫기" className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
            </div>
            <ol className="text-sm text-zinc-300 space-y-2.5">
              <li>1. 사파리 아래쪽 <span className="text-white">공유 버튼(⬆)</span>을 누르세요</li>
              <li>2. 메뉴를 내려서 <span className="text-white">&quot;홈 화면에 추가&quot;</span>를 선택하세요</li>
              <li>3. 오른쪽 위 <span className="text-white">&quot;추가&quot;</span>를 누르면 끝입니다</li>
            </ol>
            <p className="text-xs text-zinc-400 mt-4">앱처럼 전체 화면으로 열리고, 알림도 받을 수 있습니다.</p>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
