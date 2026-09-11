import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import StatusBadge from './StatusBadge'
import CategoryBadge from './CategoryBadge'
import CrowdBadge from './CrowdBadge'
import { getEventStatus, getDaysUntil, categoryMeta, parseLocalDate, STATUS } from '../data/events'
import { useBookmarks } from '../hooks/useBookmarks'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { ticketSiteName } from '../lib/ticketSite'
import PosterImage from './PosterImage'

const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

// compact: 카드가 좁을 때(모바일 2열) 날짜를 축약해서 잘리지 않게 한다.
// 1열로 보고 있으면 폭이 넉넉하니 축약하지 않는다.
export default function EventCard({ event, compact = false }) {
  const status = getEventStatus(event)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const bookmarked = isBookmarked(event.id)
  const [imgError, setImgError] = useState(false)
  const showPoster = !!event.posterUrl && !imgError

  // 카드가 더 이상 링크 안에 있지 않아서 기본 동작을 막을 필요가 없다.
  const handleDelete = async () => {
    if (!await confirm(`"${event.title}" 행사를 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteEvent(event.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const start = parseLocalDate(event.startDate)
  const end = parseLocalDate(event.endDate)
  const isSameDay = event.startDate === event.endDate

  const dateStr = isSameDay
    ? format(start, 'M월 d일 (eee)', { locale: ko })
    : `${format(start, 'M월 d일', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  // 모바일은 카드가 2열이라 폭이 절반뿐 — 위 형식은 "9월 21일 ~ 9월 2…"처럼 날짜가
  // 잘려 나간다. 좁은 화면에서만 쓰는 축약 형식을 따로 만든다.
  const compactDateStr = isSameDay
    ? format(start, 'M.d (eee)', { locale: ko })
    : `${format(start, 'M.d')} ~ ${format(end, 'M.d')}`

  // D-Day (예정 행사만)
  const daysUntil = status === 'upcoming' ? getDaysUntil(event) : null
  const dDayLabel = daysUntil === null ? null
    : daysUntil === 0 ? 'D-Day'
    : daysUntil > 0   ? `D-${daysUntil}`
    : null

  // 7일 이내 추가된 행사
  const isNew = event.createdAt
    && (Date.now() - new Date(event.createdAt).getTime()) < NEW_THRESHOLD_MS

  const ticketNotOpenYet = !!event.ticketOpenDate
    && status === 'upcoming'
    && event.ticketOpenDate > format(new Date(), 'yyyy-MM-dd')
  const siteName = ticketSiteName(event.ticketUrl)

  return (
    // 예전엔 카드 전체가 <Link>였고 그 안에 북마크·삭제 <button>이 들어 있었다.
    // 링크 안에 버튼을 넣는 건 유효하지 않은 HTML이고 키보드·스크린리더 동작도 어그러진다.
    // 카드는 일반 div로 두고, 카드 전체를 덮는 투명한 링크를 따로 깔았다(z-[1]).
    // 버튼은 그보다 위(z-10)라 그대로 눌린다.
    <div className="relative flex flex-col bg-ink/5 hover:bg-ink/10 border border-ink/10 hover:border-indigo-500/40 rounded-2xl p-3 sm:p-4 transition-all duration-200 group">
      <Link
        to={`/events/${event.id}`}
        aria-label={`${event.title} 상세 보기`}
        className="absolute inset-0 z-[1] rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
      />

      <button
        onClick={() => toggleBookmark(event.id)}
        aria-label={bookmarked ? '북마크 해제' : '북마크에 추가'}
        aria-pressed={bookmarked}
        className={`absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur transition-colors ${
          bookmarked ? 'bg-indigo-500/80 text-white' : 'bg-black/40 text-zinc-300 hover:text-white'
        }`}
      >
        {bookmarked ? '⭐' : '☆'}
      </button>

      {isAdmin && (
        <button
          onClick={handleDelete}
          aria-label="행사 삭제"
          className="absolute top-3 left-3 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold backdrop-blur transition-colors"
        >
          ×
        </button>
      )}

      {/* 포스터 */}
      <div className="relative mb-3">
        {showPoster ? (
          // 세로형 포스터가 잘리지 않도록 전체를 보여준다 (PosterImage 주석 참고).
          // 비율을 16:7에서 4:3으로 키운 것도 같은 이유다 — 16:7 안에 세로형을 통째로
          // 넣으면 포스터가 카드 폭의 1/3만 차지해서 무슨 그림인지 알아볼 수 없다.
          <PosterImage
            src={event.posterUrl}
            alt={`${event.title} 포스터`}
            onError={() => setImgError(true)}
            className="w-full aspect-[4/3] rounded-xl"
          />
        ) : (
          // 포스터가 없을 때. 예전엔 카테고리 이모지만 띄워서 "이미지를 못 불러온 건지,
          // 아직 포스터가 안 나온 건지" 구분이 안 됐다. 상태를 글자로 밝힌다.
          <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-br from-indigo-900/60 to-violet-900/40 flex flex-col items-center justify-center gap-1">
            <span className="text-2xl sm:text-3xl leading-none">{categoryMeta(event.category).emoji}</span>
            <span className="text-[10px] sm:text-xs text-zinc-300">공식 포스터 미정</span>
          </div>
        )}
        {event.ticketStatus === 'soldout' && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <span className="px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-full tracking-wide">
              매진
            </span>
          </div>
        )}
        {/* NEW 뱃지 — 10px 글씨라 대비를 따로 맞춰야 한다(흰 글씨 + emerald-500은 2.5:1뿐).
            테마마다 조합이 뒤집혀야 해서(다크: 밝은 초록 바탕+짙은 글씨, 라이트: 짙은
            초록 바탕+흰 글씨) 색을 index.css의 badge-new 토큰으로 뺐다. */}
        {isNew && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-badge-new text-badge-new-fg text-[10px] font-bold rounded-md tracking-wide">
            NEW
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-2 pr-8">
        <h3 className="font-semibold text-ink group-hover:text-indigo-300 transition-colors text-sm leading-snug line-clamp-2">
          {event.title}
        </h3>
      </div>

      {/* 카테고리 + 상태 + D-Day */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <CategoryBadge category={event.category} />
        <StatusBadge status={status} />
        {dDayLabel && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
            dDayLabel === 'D-Day'
              ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
              : daysUntil <= 7
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
              : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
          }`}>
            {dDayLabel}
          </span>
        )}
        {/* 혼잡도는 행사가 열리고 있을 때만 붙인다. 예정 행사 카드에 "혼잡"이 달려 있으면
            지금 사람이 몰려 있다는 뜻으로 읽히는데, 아직 시작도 안 한 행사다. */}
        {status === STATUS.ONGOING && (
          <CrowdBadge crowdLevel={event.crowdLevel} ticketStatus={event.ticketStatus} />
        )}
      </div>

      <div className="space-y-1 text-xs text-zinc-400 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">📅</span>
          {compact ? (
            <>
              <span className="truncate sm:hidden">{compactDateStr}</span>
              <span className="truncate hidden sm:block">{dateStr}</span>
            </>
          ) : (
            <span className="truncate">{dateStr}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">📍</span>
          <span className="truncate">{event.venue}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">💰</span>
          <span className="truncate">{event.admissionFee || '공식 미정'}</span>
        </div>
      </div>

      {ticketNotOpenYet && (
        <div className="mt-2.5 pt-2.5 border-t border-ink/10 text-xs text-indigo-400">
          {/* 오픈 "시각"이 실제로 줄을 서는 기준이라 목록에서도 같이 보여준다.
              아직 공식 발표가 없으면 비워두지 않고 미정이라고 밝힌다 — 비어 있으면
              "종일 아무 때나 열리나?"로 읽힌다. */}
          🎟 예매 오픈: {format(new Date(event.ticketOpenDate.replaceAll('-', '/')), 'M월 d일', { locale: ko })}
          {event.ticketOpenTime ? ` ${event.ticketOpenTime}` : ' (시간 미정)'}
          {siteName && ` · ${siteName}`}
        </div>
      )}
      {/* 매진이면 "예매 중"이 아니다 — 포스터엔 매진 오버레이가 걸려 있는데 바로 아래에
          "예매 중"이 같이 뜨는 모순이 있었다. */}
      {!ticketNotOpenYet && status !== STATUS.ENDED && event.ticketUrl && event.ticketStatus !== 'soldout' && (
        <div className="mt-2.5 pt-2.5 border-t border-ink/10 text-xs text-indigo-400 truncate">
          🎟 예매 중{siteName && ` · ${siteName}`}
        </div>
      )}
    </div>
  )
}
