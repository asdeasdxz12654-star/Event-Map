import { Link } from 'react-router-dom'
import EventCard from '../components/EventCard'
import { useEvents } from '../hooks/useEvents'
import { useBookmarks } from '../hooks/useBookmarks'

export default function BookmarksPage() {
  const { events, loading, error } = useEvents()
  const { bookmarkIds } = useBookmarks()

  const bookmarked = events.filter(e => bookmarkIds.includes(e.id))

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <h1 className="text-2xl lg:text-3xl font-bold text-white mb-6">북마크</h1>

      {loading && (
        <div className="text-center py-16 text-zinc-500 animate-pulse">불러오는 중...</div>
      )}

      {error && (
        <div className="text-center py-16 text-red-400">불러오기 실패</div>
      )}

      {!loading && !error && bookmarked.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">☆</div>
          <p className="mb-4">북마크한 행사가 없습니다</p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">행사 둘러보기 →</Link>
        </div>
      )}

      {!loading && bookmarked.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {bookmarked.map(event => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  )
}
