import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import StatusBadge from './StatusBadge'
import CategoryBadge from './CategoryBadge'
import { getEventStatus } from '../data/events'
import { useBookmarks } from '../hooks/useBookmarks'

const CATEGORY_EMOJI = { '게임전시': '🎮', '코스프레': '✨', '게임음악': '🎵' }

export default function EventCard({ event }) {
  const status = getEventStatus(event)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const bookmarked = isBookmarked(event.id)
  const [imgError, setImgError] = useState(false)
  const showPoster = !!event.posterUrl && !imgError
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  const isSameDay = event.startDate === event.endDate

  const dateStr = isSameDay
    ? format(start, 'M월 d일 (eee)', { locale: ko })
    : `${format(start, 'M월 d일', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  return (
    <Link
      to={`/events/${event.id}`}
      className="relative block bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-4 transition-all duration-200 group"
    >
      <button
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          toggleBookmark(event.id)
        }}
        aria-label={bookmarked ? '북마크 해제' : '북마크에 추가'}
        aria-pressed={bookmarked}
        className={`absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur transition-colors ${
          bookmarked ? 'bg-indigo-500/80 text-white' : 'bg-black/40 text-zinc-300 hover:text-white'
        }`}
      >
        {bookmarked ? '⭐' : '☆'}
      </button>

      {/* 포스터 */}
      <div className="relative mb-3">
        {showPoster ? (
          <img
            src={event.posterUrl}
            alt={`${event.title} 포스터`}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full aspect-[16/7] rounded-xl object-cover"
          />
        ) : (
          <div className="w-full aspect-[16/7] rounded-xl bg-gradient-to-br from-indigo-900/60 to-violet-900/40 flex items-center justify-center text-4xl">
            {CATEGORY_EMOJI[event.category] ?? '🎪'}
          </div>
        )}
        {event.ticketStatus === 'soldout' && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <span className="px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-full tracking-wide">
              매진
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors text-sm leading-snug">
          {event.title}
        </h3>
        <StatusBadge status={status} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <CategoryBadge category={event.category} />
      </div>

      <div className="space-y-1 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span>📅</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>📍</span>
          <span>{event.venue}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>💰</span>
          <span>{event.admissionFee}</span>
        </div>
      </div>

      {event.ticketOpenDate && status === 'upcoming' && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 text-xs text-indigo-400">
          🎟 예매 오픈: {format(new Date(event.ticketOpenDate), 'M월 d일', { locale: ko })}
        </div>
      )}
    </Link>
  )
}
