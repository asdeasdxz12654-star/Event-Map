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
  const { status: activeStatus, category: activeCategory, setStatus: setActiveStatus, setCategory: setActiveCategory } = useHomeFilters()

  const statusCounts = {
    [STATUS.UPCOMING]: filterByStatus(events, STATUS.UPCOMING).length,
    [STATUS.ONGOING]:  filterByStatus(events, STATUS.ONGOING).length,
    [STATUS.ENDED]:    filterByStatus(events, STATUS.ENDED).length,
  }

  const filtered = filterByCategory(filterByStatus(events, activeStatus), activeCategory)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">행사 정보</h1>
        <p className="text-sm text-zinc-400">국내 게임·코스프레·게임음악 행사를 한눈에</p>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-4">
        {STATUS_TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveStatus(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
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

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_FILTERS.map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setActiveCategory(key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeCategory === key
                ? 'bg-violet-600/80 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
