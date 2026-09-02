import { Link } from 'react-router-dom'
import EventCard from '../components/EventCard'
import { useEvents } from '../hooks/useEvents'
import { useBookmarks } from '../hooks/useBookmarks'

export default function BookmarksPage() {
  const { events, loading, error } = useEvents()
  const { bookmarkIds } = useBookmarks()
  const bookmarked = events.filter(e => bookmarkIds.includes(e.id))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">북마크</h1>
        <p className="text-sm text-zinc-400">별표(⭐) 해둔 관심 행사 모음</p>
      </div>

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
      ) : bookmarked.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <div className="text-4xl mb-3">☆</div>
          <p className="mb-4">아직 북마크한 행사가 없습니다</p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
            행사 둘러보기 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bookmarked.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
