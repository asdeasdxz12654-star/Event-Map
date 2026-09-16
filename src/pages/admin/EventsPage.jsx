import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/icons'
import Skeleton from '../../components/ui/Skeleton'
import Segmented from '../../components/ui/Segmented'
import { useAdminEvents } from '../../hooks/useAdminEvents'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { CATEGORIES, STATUS, getEventStatus } from '../../data/events'
import { ADMIN_INPUT } from '../../components/ui/formStyles'
import { FOCUS_RING } from '../../components/ui/focusRing'

// 행사 표.
//
// 상세페이지를 하나씩 열어보지 않고 전부를 한자리에서 보는 화면이다. 그래서 목록이
// 아니라 표다 — "굿즈가 0인 행사가 어디지"를 세로로 훑어 찾을 수 있어야 한다.
//
// 하위 개수(부스·굿즈·무대·코스어)를 같은 줄에 둔 이유가 그것이다. 0은 흐리게 적어서
// 채워진 칸 사이에서 빈칸이 눈에 띄게 한다.
const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: STATUS.UPCOMING, label: '예정' },
  { value: STATUS.ONGOING, label: '진행중' },
  { value: STATUS.ENDED, label: '종료' },
]

const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체' },
  ...Object.values(CATEGORIES).map(c => ({ value: c, label: c })),
]

const SORTS = {
  dateDesc: { label: '최신순', compare: (a, b) => b.startDate.localeCompare(a.startDate) },
  dateAsc: { label: '오래된순', compare: (a, b) => a.startDate.localeCompare(b.startDate) },
  title: { label: '제목순', compare: (a, b) => a.title.localeCompare(b.title) },
}

export default function EventsPage() {
  useDocumentTitle('행사 관리')
  const { events, loading, error, refresh } = useAdminEvents()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('dateDesc')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events
      .filter(e => status === 'all' || getEventStatus(e) === status)
      .filter(e => category === 'all' || e.category === category)
      .filter(e => !q || `${e.title} ${e.venue ?? ''} ${e.organizer ?? ''}`.toLowerCase().includes(q))
      .sort(SORTS[sort].compare)
  }, [events, query, status, category, sort])

  if (loading && events.length === 0) return <EventsSkeleton />

  if (error) {
    return (
      <div className="bg-surface-1 border border-line rounded-2xl p-6 text-center">
        <Icon name="warn" className="w-8 h-8 mx-auto mb-3 text-warn" />
        <p className="text-sm text-zinc-300 mb-1">행사를 불러오지 못했습니다</p>
        <p className="text-xs text-zinc-500 mb-4">{error.message}</p>
        <button
          type="button"
          onClick={refresh}
          className={`text-xs px-3 py-1.5 bg-surface-2 hover:bg-line text-ink rounded-lg transition-colors ${FOCUS_RING}`}
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-ink">
          행사 관리
          <span className="ml-2 text-sm font-normal text-zinc-500 tabular-nums">
            {visible.length === events.length ? events.length : `${visible.length} / ${events.length}`}
          </span>
        </h2>
        <Link
          to="/admin/events/new"
          className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors ${FOCUS_RING}`}
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          행사 추가
        </Link>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <label className="relative block">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <span className="sr-only">행사 검색</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="제목 · 장소 · 주최로 찾기"
            className={`${ADMIN_INPUT} w-full pl-9 py-2 text-sm`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} ariaLabel="상태" />
          <Segmented options={CATEGORY_OPTIONS} value={category} onChange={setCategory} ariaLabel="카테고리" />
          <Segmented
            options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
            value={sort}
            onChange={setSort}
            ariaLabel="정렬"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-center py-16 text-sm text-zinc-400">조건에 맞는 행사가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map(event => <EventRow key={event.id} event={event} />)}
        </ul>
      )}
    </div>
  )
}

function EventRow({ event }) {
  const status = getEventStatus(event)
  const { booths, items, slots, cosplayers } = event.counts

  return (
    <li>
      <Link
        to={`/admin/events/${encodeURIComponent(event.id)}`}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-surface-1 border border-line hover:border-line-strong rounded-xl px-3.5 py-2.5 transition-colors ${FOCUS_RING}`}
      >
        <StatusDot status={status} />

        <span className="min-w-0 flex-1 basis-full sm:basis-0">
          <span className="block text-sm font-medium text-ink truncate">{event.title}</span>
          <span className="block text-[11px] text-zinc-500 truncate">
            <span className="tabular-nums">{event.startDate}</span>
            {event.endDate !== event.startDate && <span className="tabular-nums"> ~ {event.endDate}</span>}
            {event.venue && <> · {event.venue}</>}
          </span>
        </span>

        <span className="shrink-0 text-[11px] text-zinc-500">{event.category}</span>

        <span className="shrink-0 flex items-center gap-2 text-[11px] tabular-nums">
          <Count label="부스" n={booths} />
          <Count label="굿즈" n={items} />
          <Count label="무대" n={slots} />
          <Count label="코스어" n={cosplayers} />
        </span>

        {event.adminEditedAt && (
          <span
            className="shrink-0 flex items-center gap-1 text-[11px] text-warn"
            title="직접 수정한 행사입니다. 크롤러가 자동으로 갱신하지 않습니다."
          >
            <Icon name="key" className="w-3 h-3" />
            잠김
          </span>
        )}

        <Icon name="chevronRight" className="shrink-0 w-4 h-4 text-zinc-600" />
      </Link>
    </li>
  )
}

// 0은 흐리게. 채워진 칸 사이에서 빈칸이 눈에 띄어야 한다 — 이 표의 쓸모가 그것이다.
function Count({ label, n }) {
  return (
    <span className={n > 0 ? 'text-zinc-300' : 'text-zinc-700'}>
      <span className="text-zinc-600">{label}</span> {n}
    </span>
  )
}

function StatusDot({ status }) {
  const meta = {
    [STATUS.ONGOING]: { cls: 'bg-live', label: '진행중' },
    [STATUS.UPCOMING]: { cls: 'bg-indigo-500', label: '예정' },
    [STATUS.ENDED]: { cls: 'bg-zinc-700', label: '종료' },
  }[status]
  return (
    <span className="shrink-0 flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${meta.cls}`} aria-hidden="true" />
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

function EventsSkeleton() {
  return (
    <div>
      <Skeleton className="h-6 w-28 mb-3" />
      <Skeleton className="h-9 w-full rounded-lg mb-2" />
      <Skeleton className="h-8 w-2/3 rounded-lg mb-4" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
      <span className="sr-only" role="status">행사를 불러오는 중입니다</span>
    </div>
  )
}
