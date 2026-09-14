import { Link } from 'react-router-dom'
import EventCard from '../components/EventCard'
import EventCardSkeleton from '../components/EventCardSkeleton'
import Icon from '../components/icons'
import { FOCUS_RING } from '../components/ui/focusRing'
import { useEvents } from '../hooks/useEvents'
import { useBookmarks } from '../hooks/useBookmarks'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useListColumns, eventGridClass } from '../hooks/useListColumns'

export default function BookmarksPage() {
  useDocumentTitle('북마크')
  const { events, loading, error } = useEvents()
  const { bookmarkIds } = useBookmarks()
  const [columns] = useListColumns() // 열 수는 홈에서 고른 설정을 그대로 따른다

  const bookmarked = events.filter(e => bookmarkIds.includes(e.id))

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="flex items-baseline gap-2 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">북마크</h1>
        {!loading && bookmarked.length > 0 && (
          <span className="text-sm text-zinc-400 tabular-nums">{bookmarked.length}개</span>
        )}
      </div>

      {/* 기다리는 모습은 홈과 같아야 한다 — 홈에서 북마크로 넘어올 때 화면이 튀지 않게 */}
      {loading && (
        <div className={eventGridClass(columns)}>
          {Array.from({ length: columns === 1 ? 2 : 4 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      )}

      {error && (
        <div className="text-center py-16 text-danger">
          <Icon name="warn" className="w-9 h-9 mx-auto mb-3" />
          <p>행사 정보를 불러오지 못했습니다</p>
        </div>
      )}

      {!loading && !error && bookmarked.length === 0 && (
        <div className="text-center py-16 text-zinc-400">
          <Icon name="star" className="w-9 h-9 mx-auto mb-3 text-zinc-500" />
          <p className="mb-4">북마크한 행사가 없습니다</p>
          <Link to="/" className={`text-indigo-400 hover:text-indigo-300 text-sm rounded ${FOCUS_RING}`}>
            행사 둘러보기 →
          </Link>
        </div>
      )}

      {!loading && bookmarked.length > 0 && (
        <div className={eventGridClass(columns)}>
          {bookmarked.map(event => <EventCard key={event.id} event={event} compact={columns === 2} />)}
        </div>
      )}
    </div>
  )
}
