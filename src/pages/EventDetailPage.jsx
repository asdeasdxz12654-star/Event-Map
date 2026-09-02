import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getEventStatus } from '../data/events'
import StatusBadge from '../components/StatusBadge'
import CategoryBadge from '../components/CategoryBadge'
import TrustScore from '../components/TrustScore'
import { useEvents } from '../hooks/useEvents'

export default function EventDetailPage() {
  const { id } = useParams()
  const { events, loading, error } = useEvents()
  const event = events.find(e => e.id === id)

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-zinc-500">
        <div className="text-4xl mb-3 animate-pulse">⏳</div>
        <p>행사 정보를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-zinc-400 mb-4">행사 정보를 찾을 수 없습니다</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← 목록으로</Link>
      </div>
    )
  }

  const status = getEventStatus(event)
  const start = new Date(event.startDate)
  const end = new Date(event.endDate)
  const isSameDay = event.startDate === event.endDate

  const dateStr = isSameDay
    ? format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })
    : `${format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  const naverMapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(event.venueAddress)}`
  const kakaoMapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(event.venue + ' ' + event.venueAddress)}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link to="/" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
        ← 목록으로
      </Link>

      {/* 포스터 플레이스홀더 */}
      <div className="w-full aspect-[16/7] rounded-2xl bg-gradient-to-br from-indigo-900/60 to-violet-900/40 mb-6 flex items-center justify-center text-6xl">
        {event.category === '게임전시' ? '🎮' : event.category === '코스프레' ? '✨' : '🎵'}
      </div>

      {/* 타이틀 영역 */}
      <div className="flex flex-wrap items-start gap-2 mb-2">
        <StatusBadge status={status} />
        <CategoryBadge category={event.category} />
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

      {/* 지도 버튼 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-white mb-3">위치 & 경로</h2>
        <div className="flex gap-2">
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

      {/* CTA 버튼 */}
      <div className="flex flex-col gap-2">
        {event.ticketUrl && (
          <a
            href={event.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-2xl text-center transition-colors shadow-lg shadow-indigo-900/50"
          >
            🎟 예매하기
          </a>
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
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-5">{icon}</span>
      <span className="text-zinc-400 shrink-0 w-14">{label}</span>
      <span className="text-zinc-200 whitespace-pre-line">{value}</span>
    </div>
  )
}
