import { useMemo, useState } from 'react'
import EventCard from '../components/EventCard'
import EventCardSkeleton from '../components/EventCardSkeleton'
import FilterBar from '../components/FilterBar'
import FilterSheet from '../components/FilterSheet'
import ActiveFilters from '../components/ActiveFilters'
import Icon from '../components/icons'
import { FOCUS_RING } from '../components/ui/focusRing'
import { filterByStatus, filterByCategory, filterBySearch, filterByMonth, getActiveMonths, sortByNewest, STATUS } from '../data/events'
import { useEvents } from '../hooks/useEvents'
import { useHomeFilters } from '../hooks/useHomeFilters'
import { useListColumns, eventGridClass } from '../hooks/useListColumns'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAdmin } from '../contexts/AdminContext'
import AdminEventForm from '../components/AdminEventForm'

export default function HomePage() {
  useDocumentTitle(null)
  const { events, loading, error } = useEvents()
  const { isAdmin } = useAdmin()
  const [columns, setColumns] = useListColumns()
  const [showAddForm, setShowAddForm] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const {
    status: activeStatus,
    category: activeCategory,
    hideSoldout,
    search,
    sort,
    month: activeMonth,
    setStatus: setActiveStatus,
    setCategory: setActiveCategory,
    setHideSoldout,
    setSearch,
    setSort,
    setMonth: setActiveMonth,
    resetAll,
  } = useHomeFilters()

  // 목록 전체를 세 번 훑는 집계라, 검색어를 한 글자 칠 때마다 다시 돌 이유가 없다.
  const statusCounts = useMemo(() => ({
    [STATUS.UPCOMING]: filterByStatus(events, STATUS.UPCOMING).length,
    [STATUS.ONGOING]:  filterByStatus(events, STATUS.ONGOING).length,
    [STATUS.ENDED]:    filterByStatus(events, STATUS.ENDED).length,
  }), [events])

  // 상태·카테고리·검색·매진까지 거른 목록. 월 필터 버튼(activeMonths)은 "이 조건에서
  // 행사가 있는 달"이라 월 선택 전 단계의 결과로 만들어야 한다.
  const baseBeforeMonth = useMemo(() => filterBySearch(
    filterByCategory(filterByStatus(events, activeStatus), activeCategory),
    search
  ).filter(e => !hideSoldout || e.ticketStatus !== 'soldout'),
  [events, activeStatus, activeCategory, search, hideSoldout])

  const activeMonths = useMemo(() => getActiveMonths(baseBeforeMonth), [baseBeforeMonth]) // ['2026-09', ...]

  // 고른 달은 저장돼 있는데(useHomeFilters) 상태·카테고리·검색을 바꾸면 그 달에 행사가
  // 아예 없어질 수 있다. 그때 저장된 값을 그대로 쓰면 월 버튼은 아무것도 눌린 상태가
  // 아닌데 목록만 비어서, 왜 비었는지 알 방법이 없다.
  // 지금 조건에서 존재하지 않는 달은 "전체"로 본다.
  const effectiveMonth = activeMonth && activeMonths.includes(activeMonth) ? activeMonth : null

  const filtered = useMemo(() => {
    const base = filterByMonth(baseBeforeMonth, effectiveMonth)
    return sort === 'newest' ? sortByNewest(base) : base
  }, [baseBeforeMonth, effectiveMonth, sort])

  // 한 해 안이면 "9월", 내년 행사까지 섞여 보이면 "26.9월"처럼 연도를 붙여 구분한다.
  const spansMultipleYears = new Set(activeMonths.map(ym => ym.slice(0, 4))).size > 1

  const monthLabel = ym => {
    const [year, month] = ym.split('-')
    return spansMultipleYears ? `${year.slice(2)}.${Number(month)}월` : `${Number(month)}월`
  }

  // 목록 위에 드러내는 "지금 걸려 있는 조건". 실제로 결과를 줄이는 것만 넣는다 —
  // 정렬은 순서만 바꾸므로 건수 옆 글자로 보여주고 칩으로는 만들지 않는다.
  const activeItems = [
    activeCategory && {
      key: 'category',
      label: activeCategory,
      onRemove: () => setActiveCategory(null),
    },
    effectiveMonth && {
      key: 'month',
      label: monthLabel(effectiveMonth),
      onRemove: () => setActiveMonth(null),
    },
    hideSoldout && {
      key: 'soldout',
      label: '매진 제외',
      onRemove: () => setHideSoldout(false),
    },
    search && {
      key: 'search',
      label: `"${search}"`,
      onRemove: () => setSearch(''),
    },
  ].filter(Boolean)

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-5 lg:mb-7">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink mb-1">행사 정보</h1>
          <p className="text-sm lg:text-base text-zinc-400">국내 게임·코스프레·게임음악·일러스트 행사를 한눈에</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors ${FOCUS_RING}`}
          >
            <Icon name="plus" className="w-4 h-4" />
            행사 추가
          </button>
        )}
      </div>

      {showAddForm && <AdminEventForm onClose={() => setShowAddForm(false)} />}

      <FilterBar
        status={activeStatus}
        onStatusChange={setActiveStatus}
        statusCounts={statusCounts}
        category={activeCategory}
        onCategoryChange={setActiveCategory}
        search={search}
        onSearchChange={setSearch}
        // 검색은 입력칸이 직접 보이므로 개수에 넣지 않는다 — 그 줄이 이미 상태를 말한다.
        activeCount={activeItems.filter(i => i.key !== 'search').length}
        onOpenFilters={() => setShowFilters(true)}
      />

      {showFilters && (
        <FilterSheet
          months={activeMonths}
          monthLabel={monthLabel}
          month={effectiveMonth}
          onMonthChange={setActiveMonth}
          sort={sort}
          onSortChange={setSort}
          hideSoldout={hideSoldout}
          onHideSoldoutChange={setHideSoldout}
          columns={columns}
          onColumnsChange={setColumns}
          resultCount={filtered.length}
          onClose={() => setShowFilters(false)}
        />
      )}

      {!loading && !error && (
        <ActiveFilters
          items={activeItems}
          onClearAll={resetAll}
          resultCount={filtered.length}
          sortLabel={sort === 'newest' ? '최신순' : '날짜순'}
          searching={!!search}
        />
      )}

      {/* 이벤트 그리드 */}
      {loading ? (
        <div className={eventGridClass(columns)}>
          {Array.from({ length: columns === 1 ? 3 : 6 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-danger">
          <Icon name="warn" className="w-9 h-9 mx-auto mb-3" />
          <p>행사 정보를 불러오지 못했습니다</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Icon name={search ? 'search' : 'calendar'} className="w-9 h-9 mx-auto mb-3 text-zinc-500" />
          <p>{search ? `"${search}"에 해당하는 행사가 없습니다` : '해당하는 행사가 없습니다'}</p>
          {activeItems.length > 0 && (
            <button onClick={resetAll} className={`mt-3 text-indigo-400 hover:text-indigo-300 text-sm rounded ${FOCUS_RING}`}>
              조건 모두 해제
            </button>
          )}
        </div>
      ) : (
        <div className={eventGridClass(columns)}>
          {filtered.map(event => (
            <EventCard key={event.id} event={event} compact={columns === 2} />
          ))}
        </div>
      )}
    </div>
  )
}
