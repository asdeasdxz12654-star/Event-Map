import { useState } from 'react'
import EventCard from '../components/EventCard'
import { filterByStatus, filterByCategory, filterBySearch, sortByNewest, STATUS, CATEGORIES } from '../data/events'
import { useEvents } from '../hooks/useEvents'
import { useHomeFilters } from '../hooks/useHomeFilters'
import { useAdmin } from '../contexts/AdminContext'
import AdminEventForm from '../components/AdminEventForm'

const STATUS_TABS = [
  { key: STATUS.UPCOMING, label: '예정',  icon: '🕐' },
  { key: STATUS.ONGOING,  label: '진행중', icon: '🟢' },
  { key: STATUS.ENDED,    label: '종료',  icon: '⏹' },
]

const CATEGORY_FILTERS = [
  { key: null,              label: '전체' },
  { key: CATEGORIES.GAME,   label: '🎮 게임전시' },
  { key: CATEGORIES.COSPLAY,label: '✨ 코스프레' },
  { key: CATEGORIES.CONCERT,label: '🎵 게임음악' },
]

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-white/5 border border-white/10 rounded-2xl p-4 animate-pulse">
      <div className="w-full aspect-[16/7] rounded-xl bg-white/10 mb-3" />
      <div className="flex items-start gap-2 mb-2 pr-8">
        <div className="h-4 bg-white/10 rounded w-3/4" />
      </div>
      <div className="flex gap-1.5 mb-3">
        <div className="h-5 bg-white/10 rounded-full w-20" />
        <div className="h-5 bg-white/10 rounded-full w-12" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-white/10 rounded w-full" />
        <div className="h-3 bg-white/10 rounded w-4/5" />
        <div className="h-3 bg-white/10 rounded w-3/5" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { events, loading, error } = useEvents()
  const { isAdmin } = useAdmin()
  const [showAddForm, setShowAddForm] = useState(false)
  const {
    status: activeStatus,
    category: activeCategory,
    hideSoldout,
    search,
    sort,
    setStatus: setActiveStatus,
    setCategory: setActiveCategory,
    setHideSoldout,
    setSearch,
    setSort,
  } = useHomeFilters()

  const statusCounts = {
    [STATUS.UPCOMING]: filterByStatus(events, STATUS.UPCOMING).length,
    [STATUS.ONGOING]:  filterByStatus(events, STATUS.ONGOING).length,
    [STATUS.ENDED]:    filterByStatus(events, STATUS.ENDED).length,
  }

  const base = filterBySearch(
    filterByCategory(filterByStatus(events, activeStatus), activeCategory),
    search
  ).filter(e => !hideSoldout || e.ticketStatus !== 'soldout')

  const filtered = sort === 'newest' ? sortByNewest(base) : base

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">행사 정보</h1>
          <p className="text-sm lg:text-base text-zinc-400">국내 게임·코스프레·게임음악 행사를 한눈에</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            + 행사 추가
          </button>
        )}
      </div>

      {showAddForm && (
        <AdminEventForm onClose={() => setShowAddForm(false)} />
      )}

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

      {/* 검색 */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="행사명, 장소, 주최사 검색..."
          className="w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-sm"
            aria-label="검색 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {/* 카테고리 필터 + 정렬 + 매진 제외 */}
      <div className="flex flex-wrap items-center gap-2 mb-4 lg:mb-5">
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

        <div className="flex items-center gap-1.5 ml-auto">
          {/* 정렬 */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button
              onClick={() => setSort('date')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                sort === 'date' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              날짜순
            </button>
            <button
              onClick={() => setSort('newest')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-white/10 ${
                sort === 'newest' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              최신순
            </button>
          </div>

          {/* 매진 제외 */}
          <button
            onClick={() => setHideSoldout(!hideSoldout)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              hideSoldout
                ? 'bg-red-600/20 border-red-500/40 text-red-400'
                : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'
            }`}
          >
            {hideSoldout ? '매진 숨김 ✓' : '매진 제외'}
          </button>
        </div>
      </div>

      {/* 건수 표시 */}
      {!loading && !error && (
        <p className="text-xs text-zinc-500 mb-4">
          {search
            ? `"${search}" 검색 결과 ${filtered.length}건`
            : `${filtered.length}개 행사`}
        </p>
      )}

      {/* 이벤트 그리드 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <div className="text-4xl mb-3">⚠️</div>
          <p>행사 정보를 불러오지 못했습니다</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">{search ? '🔍' : '📭'}</div>
          <p>{search ? `"${search}"에 해당하는 행사가 없습니다` : '해당하는 행사가 없습니다'}</p>
          {search && (
            <button onClick={() => setSearch('')} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">
              검색 초기화
            </button>
          )}
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
