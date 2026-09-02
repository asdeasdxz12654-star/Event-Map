import EventCard from '../components/EventCard'
import { filterByStatus, filterByCategory, STATUS, CATEGORIES } from '../data/events'
import { useEvents } from '../hooks/useEvents'
import { useHomeFilters } from '../hooks/useHomeFilters'

const STATUS_TABS = [
  { key: STATUS.UPCOMING, label: '예정', icon: '🕐' },
  { key: STATUS.ONGOING,  label: '진행중', icon: '🟢' },
  { key: STATUS.ENDED,    label: '종료', icon: '⏹' },
]

const CATEGORY_FILTERS = [
  { key: null, label: '전체' },
  { key: CATEGORIES.GAME,    label: '🎮 게임전시' },
  { key: CATEGORIES.COSPLAY, label: '✨ 코스프레' },
  { key: CATEGORIES.CONCERT, label: '🎵 게임음악' },
]

export default function HomePage() {
  const { events, loading, error } = useEvents()
  const {
    status: activeStatus,
    category: activeCategory,
    hideSoldout,
    setStatus: setActiveStatus,
    setCategory: setActiveCategory,
    setHideSoldout,
  } = useHomeFilters()

  const statusCounts = {
    [STATUS.UPCOMING]: filterByStatus(events, STATUS.UPCOMING).length,
    [STATUS.ONGOING]:  filterByStatus(events, STATUS.ONGOING).length,
    [STATUS.ENDED]:    filterByStatus(events, STATUS.ENDED).length,
  }

  const filtered = filterByCategory(filterByStatus(events, activeStatus), activeCategory)
    .filter(e => !hideSoldout || e.ticketStatus !== 'soldout')

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      {/* 헤더 */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">행사 정보</h1>
        <p className="text-sm lg:text-base text-zinc-400">국내 게임·코스프레·게임음악 행사를 한눈에</p>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 lg:gap-3 mb-4 lg:mb-5">
        {STATUS_TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveStatus(key)}
            className={`flex items-center gap-1.5 px-4 py-2 lg:px-5 lg:py-2.5 rounded-xl text-sm lg:text-base font-medium transition-all ${
              activeStatus === key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeStatus === key ? 'bg-white/20' : 'bg-white/10'
            }`}>
              {statusCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* 카테고리 필터 + 매진 제외 토글 */}
      <div className="flex flex-wrap items-center gap-2 mb-6 lg:mb-8">
        {CATEGORY_FILTERS.map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setActiveCategory(key)}
            className={`shrink-0 px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition-all ${
              activeCategory === key
                ? 'bg-violet-600/80 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setHideSoldout(!hideSoldout)}
          className={`shrink-0 ml-auto px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition-all border ${
            hideSoldout
              ? 'bg-red-600/20 border-red-500/40 text-red-400'
              : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'
          }`}
        >
          {hideSoldout ? '매진 숨김 ✓' : '매진 제외'}
        </button>
      </div>

      {/* 이벤트 그리드 */}
      {loading ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3 animate-pulse">⏳</div>
          <p>행사 정보를 불러오는 중...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <div className="text-4xl mb-3">⚠️</div>
          <p>행사 정보를 불러오지 못했습니다</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">📭</div>
          <p>해당하는 행사가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {filtered.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
