import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getEventStatus } from '../data/events'
import StatusBadge from '../components/StatusBadge'
import CategoryBadge from '../components/CategoryBadge'
import TrustScore from '../components/TrustScore'
import { useEvents } from '../hooks/useEvents'
import { useBookmarks } from '../hooks/useBookmarks'
import { useCosplayersByEvent } from '../hooks/useCosplayers'
import CosplayerCard from '../components/CosplayerCard'
import { downloadEventIcs } from '../utils/ics'

const CATEGORY_EMOJI = { '게임전시': '🎮', '코스프레': '✨', '게임음악': '🎵' }

export default function EventDetailPage() {
  const { id } = useParams()
  const { events, loading, error } = useEvents()
  const event = events.find(e => e.id === id)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const { cosplayers, loading: cosplayersLoading } = useCosplayersByEvent(id)
  const [imgError, setImgError] = useState(false)

  if (loading) {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-16 text-center text-zinc-500">
        <div className="text-4xl mb-3 animate-pulse">⏳</div>
        <p>행사 정보를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-16 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-zinc-400 mb-4">행사 정보를 찾을 수 없습니다</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← 목록으로</Link>
      </div>
    )
  }

  const status = getEventStatus(event)
  const bookmarked = isBookmarked(event.id)
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  const isSameDay = event.startDate === event.endDate

  const dateStr = isSameDay
    ? format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })
    : `${format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  const hasCoords = event.venueLat != null && event.venueLng != null

  // 지도 보기 링크
  const venueAddress = event.venueAddress ?? ''
  const venueName = event.venue ?? ''
  const naverMapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(venueAddress || venueName)}`
  const kakaoMapUrl = hasCoords
    ? `https://map.kakao.com/link/to/${encodeURIComponent(venueName)},${event.venueLat},${event.venueLng}`
    : `https://map.kakao.com/link/search/${encodeURIComponent([venueName, venueAddress].filter(Boolean).join(' '))}`

  // 대중교통 길찾기 링크 (현재 위치 → 행사장)
  // 네이버 방향 URL: directions/{from}/{to}/{경유}/{mode}, 좌표 순서는 경도,위도
  const naverTransitUrl = hasCoords
    ? `https://map.naver.com/v5/directions/-/-/${encodeURIComponent(venueName)},${event.venueLng},${event.venueLat}/transit`
    : `https://map.naver.com/v5/search/${encodeURIComponent(venueAddress || venueName)}`
  const googleTransitUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${event.venueLat},${event.venueLng}&travelmode=transit`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venueAddress || venueName)}&travelmode=transit`

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      {/* 뒤로가기 */}
      <Link to="/" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        ← 목록으로
      </Link>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
        <div className="lg:max-w-2xl">
          {/* 포스터 */}
          {event.posterUrl && !imgError ? (
            <img
              src={event.posterUrl}
              alt={`${event.title} 포스터`}
              onError={() => setImgError(true)}
              className="w-full rounded-2xl object-cover mb-6 max-h-[480px]"
            />
          ) : (
            <div className="w-full aspect-[16/7] rounded-2xl bg-gradient-to-br from-indigo-900/60 to-violet-900/40 mb-6 flex items-center justify-center text-6xl">
              {CATEGORY_EMOJI[event.category] ?? '🎪'}
            </div>
          )}

          {/* 타이틀 영역 */}
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-start gap-2">
              <StatusBadge status={status} />
              <CategoryBadge category={event.category} />
            </div>
            <button
              onClick={() => toggleBookmark(event.id)}
              aria-pressed={bookmarked}
              className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border text-lg transition-colors ${
                bookmarked
                  ? 'bg-indigo-600/80 border-indigo-500/50 text-white'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {bookmarked ? '⭐' : '☆'}
            </button>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{event.title}</h1>
          <p className="text-zinc-400 text-sm mb-6">{event.description}</p>

          {/* 기본 정보 카드 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 mb-4">
            <InfoRow icon="📅" label="기간" value={dateStr} />
            <InfoRow icon="📍" label="장소" value={`${event.venue}\n${event.venueAddress}`} />
            <InfoRow icon="💰" label="입장료" value={event.admissionFee} />
            <InfoRow icon="🏢" label="주최" value={event.organizer} />
            {event.ticketOpenDate && (
              <InfoRow
                icon="🎟"
                label="예매 오픈"
                value={format(new Date(event.ticketOpenDate), 'yyyy년 M월 d일', { locale: ko })}
              />
            )}
          </div>

          {/* 신뢰도 카드 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-white mb-2">행사 신뢰도</h2>
            <TrustScore score={event.trustScore} pastEvents={event.pastEvents} />
          </div>

          {/* 참가 코스어 */}
          {(cosplayersLoading || cosplayers.length > 0) && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
              <h2 className="text-sm font-semibold text-white mb-3">
                🎭 참가 코스어 {!cosplayersLoading && `(${cosplayers.length})`}
              </h2>
              {cosplayersLoading ? (
                <p className="text-xs text-zinc-500 animate-pulse">불러오는 중...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cosplayers.map(c => (
                    <CosplayerCard key={c.id} cosplayer={c} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 위치 & 경로 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-white mb-3">위치 & 경로</h2>

            <p className="text-xs text-zinc-500 mb-1.5">지도에서 보기</p>
            <div className="flex gap-2 mb-3">
              <a
                href={naverMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-green-600/80 hover:bg-green-600 text-white text-sm font-medium rounded-xl text-center transition-colors"
              >
                네이버 지도
              </a>
              <a
                href={kakaoMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-yellow-500/80 hover:bg-yellow-500 text-black text-sm font-medium rounded-xl text-center transition-colors"
              >
                카카오맵
              </a>
            </div>

            <p className="text-xs text-zinc-500 mb-1.5">대중교통 길찾기</p>
            <div className="flex gap-2">
              <a
                href={naverTransitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-green-700/80 hover:bg-green-700 text-white text-sm font-medium rounded-xl text-center transition-colors"
              >
                🚇 네이버
              </a>
              <a
                href={googleTransitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-medium rounded-xl text-center transition-colors"
              >
                🗺 구글 맵
              </a>
            </div>
          </div>

          {/* 태그 */}
          {event.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {event.tags.map(tag => (
                <span key={tag} className="text-xs px-2.5 py-1 bg-white/5 text-zinc-400 rounded-full border border-white/10">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA 버튼 — PC에서는 오른쪽 사이드바에 고정 표시되므로 모바일에서만 노출 */}
          <div className="lg:hidden">
            <CtaButtons event={event} />
          </div>
        </div>

        {/* PC 전용 사이드바: 예매/캘린더 CTA를 스크롤해도 계속 보이게 고정 */}
        <div className="hidden lg:block lg:sticky lg:top-20">
          <CtaButtons event={event} />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-5">{icon}</span>
      <span className="text-zinc-400 shrink-0 w-16 whitespace-nowrap">{label}</span>
      <span className="text-zinc-200 whitespace-pre-line">{value}</span>
    </div>
  )
}

function CtaButtons({ event }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => downloadEventIcs(event)}
        className="w-full py-3 bg-white/10 hover:bg-white/15 text-white text-sm rounded-2xl text-center transition-colors"
      >
        📅 캘린더에 추가 (.ics)
      </button>
      {event.ticketUrl && (
        event.ticketStatus === 'soldout' ? (
          <div className="w-full py-3.5 bg-zinc-800 text-zinc-500 font-semibold rounded-2xl text-center select-none">
            🎟 매진
          </div>
        ) : (
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl text-center transition-colors shadow-lg shadow-indigo-900/50"
          >
            🎟 {event.ticketStatus === 'available' ? '예매하기' : '예매 페이지'}
          </a>
        )
      )}
      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-white/10 hover:bg-white/15 text-white text-sm rounded-2xl text-center transition-colors"
        >
          공식 사이트 →
        </a>
      )}
    </div>
  )
}
