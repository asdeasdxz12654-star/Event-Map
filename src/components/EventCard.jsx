import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Icon, { StarFilled } from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { getEventStatus, getDaysUntil, categoryMeta, parseLocalDate, STATUS } from '../data/events'
import { useBookmarks } from '../hooks/useBookmarks'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { ticketSiteName } from '../lib/ticketSite'
import PosterImage from './PosterImage'

// 목록 카드.
//
// 예전 카드에는 정보 블록이 여덟 개 있었다 — 포스터·제목·뱃지 네 개(카테고리·상태·
// D-day·혼잡도)·날짜·장소·입장료·예매 줄. 모바일 2열에서 카드 폭이 164px뿐인데
// 여덟 덩어리를 넣으니 뱃지가 줄바꿈되고 글씨가 10px까지 내려갔다.
//
// 목록에서 실제로 쓰이는 건 "이게 무슨 행사고, 언제, 어디서 하나" 셋이다. 나머지는
// 상세 화면이 맡는다. 그래서 본문은 제목 · 날짜 · 장소 세 줄로 줄이고, 남은 정보 중
// 훑을 때 필요한 것(임박·진행중·예매·매진)만 포스터 위에 얹었다.
//
// 포스터 비율도 4:3에서 3:4로 바꿨다. 공식 포스터는 대부분 세로형이라, 가로 틀에
// 넣으면 좌우가 전부 흐린 여백이 되고 정작 그림은 카드 폭의 1/3만 차지했다.
export default function EventCard({ event, compact = false }) {
  const status = getEventStatus(event)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const bookmarked = isBookmarked(event.id)
  const [imgError, setImgError] = useState(false)
  const showPoster = !!event.posterUrl && !imgError

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

  // 요일이 실제 계획에 쓰이는 정보라 두 형식 모두에 남긴다. 2열에서도 잘리지 않도록
  // "11.14 금 – 11.17 월"처럼 짧게 쓴다 (예전 "11월 14일 ~ 11월 1…"은 끝이 잘렸다).
  const dateStr = isSameDay
    ? format(start, 'M.d (eee)', { locale: ko })
    : `${format(start, 'M.d', { locale: ko })} – ${format(end, 'M.d (eee)', { locale: ko })}`
  const longDateStr = isSameDay
    ? format(start, 'M월 d일 (eee)', { locale: ko })
    : `${format(start, 'M월 d일', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  // D-Day (예정 행사만)
  const daysUntil = status === STATUS.UPCOMING ? getDaysUntil(event) : null
  const dDayLabel = daysUntil === null ? null
    : daysUntil === 0 ? 'D-Day'
    : daysUntil > 0   ? `D-${daysUntil}`
    : null
  // 임박한 것만 강조색을 쓴다. 두 달 뒤 행사까지 색이 붙으면 임박했다는 뜻이 사라진다.
  const dDayUrgent = daysUntil !== null && daysUntil <= 7

  const soldout = event.ticketStatus === 'soldout'
  const siteName = ticketSiteName(event.ticketUrl)
  const ticketNotOpenYet = !!event.ticketOpenDate
    && status === STATUS.UPCOMING
    && event.ticketOpenDate > format(new Date(), 'yyyy-MM-dd')

  // 포스터 아래에 한 줄로 얹는 예매 안내. 없으면 줄 자체가 없다.
  const ticketLine = soldout ? null
    : ticketNotOpenYet
      ? `${format(new Date(event.ticketOpenDate.replaceAll('-', '/')), 'M.d', { locale: ko })}${event.ticketOpenTime ? ` ${event.ticketOpenTime}` : ''} 오픈`
      : status !== STATUS.ENDED && event.ticketUrl
        ? `예매 중${siteName ? ` · ${siteName}` : ''}`
        : null

  return (
    // 카드 전체를 덮는 투명한 링크를 깔고(z-[1]) 버튼은 그 위에 둔다(z-10).
    // 예전처럼 <Link> 안에 <button>을 넣으면 유효하지 않은 HTML이고 키보드·스크린리더
    // 동작도 어그러진다.
    <div className="relative flex flex-col group">
      <Link
        to={`/events/${event.id}`}
        aria-label={`${event.title} 상세 보기`}
        className={`absolute inset-0 z-[1] rounded-2xl ${FOCUS_RING}`}
      />

      <div className="relative mb-2.5">
        {showPoster ? (
          <PosterImage
            src={event.posterUrl}
            alt={`${event.title} 포스터`}
            onError={() => setImgError(true)}
            className="w-full aspect-[3/4] rounded-xl border border-line"
          />
        ) : (
          // 포스터가 없을 때. "이미지를 못 불러온 건지, 아직 포스터가 안 나온 건지"를
          // 구분할 수 있게 상태를 글자로 밝힌다.
          // 이모지를 남긴 유일한 자리다 — 여기서는 색과 크기가 오히려 장점이고,
          // 대신 놓을 일러스트가 없다.
          <div className="w-full aspect-[3/4] rounded-xl border border-line bg-gradient-to-br from-indigo-900/60 to-violet-900/40 flex flex-col items-center justify-center gap-1.5">
            <span className="text-3xl leading-none" aria-hidden="true">{categoryMeta(event.category).emoji}</span>
            <span className="text-[11px] text-zinc-300">공식 포스터 미정</span>
          </div>
        )}

        {/* 포스터 아래쪽을 어둡게 깔아 흰 글자가 어떤 포스터 위에서도 읽히게 한다 */}
        {(ticketLine || soldout) && (
          <div className="absolute inset-x-0 bottom-0 h-1/3 rounded-b-xl bg-gradient-to-t from-black/85 to-transparent pointer-events-none" aria-hidden="true" />
        )}

        {/* 왼쪽 위 — 지금 열리는 중이거나, 곧 열리는 행사에만 붙는다 */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {status === STATUS.ONGOING && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/65 backdrop-blur text-live text-[11px] font-semibold border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-live" aria-hidden="true" />
              진행중
            </span>
          )}
          {dDayLabel && (
            <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums backdrop-blur border ${
              dDayUrgent
                ? 'bg-indigo-600/90 text-white border-transparent'
                : 'bg-black/65 text-white border-white/10'
            }`}>
              {dDayLabel}
            </span>
          )}
        </div>

        <button
          onClick={() => toggleBookmark(event.id)}
          aria-label={bookmarked ? '북마크 해제' : '북마크에 추가'}
          aria-pressed={bookmarked}
          className={`absolute top-1.5 right-1.5 z-10 w-9 h-9 flex items-center justify-center rounded-full backdrop-blur transition-colors ${FOCUS_RING} ${
            bookmarked ? 'bg-indigo-500/90 text-white' : 'bg-black/45 text-white/85 hover:text-white'
          }`}
        >
          {bookmarked ? <StarFilled className="w-[17px] h-[17px]" /> : <Icon name="star" className="w-[17px] h-[17px]" />}
        </button>

        {isAdmin && (
          <button
            onClick={handleDelete}
            aria-label="행사 삭제"
            className={`absolute bottom-1.5 right-1.5 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-danger/80 hover:bg-danger text-white backdrop-blur transition-colors ${FOCUS_RING}`}
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        )}

        {soldout ? (
          <>
            <div className="absolute inset-0 rounded-xl bg-black/55" aria-hidden="true" />
            <span className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-danger text-white text-[11px] font-bold tracking-wide">
              매진
            </span>
          </>
        ) : ticketLine && (
          <span className="absolute bottom-2 left-2 right-11 flex items-center gap-1.5 text-[11px] text-white/90 tabular-nums">
            <Icon name="ticket" className="w-3 h-3" />
            <span className="truncate">{ticketLine}</span>
          </span>
        )}
      </div>

      <h3 className="font-semibold text-ink group-hover:text-indigo-300 transition-colors text-[13px] sm:text-sm leading-snug line-clamp-2 mb-1.5">
        {event.title}
      </h3>

      <div className="space-y-1 text-xs text-zinc-400 min-w-0">
        <div className="flex items-center gap-1.5 tabular-nums">
          {/* 카테고리는 여기 색점 하나로 남는다 — 예전엔 본문에 색 알약이 따로 있었다 */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryMeta(event.category).dotClass}`} aria-hidden="true" />
          <span className="truncate">{compact ? dateStr : longDateStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="pin" className="w-3.5 h-3.5 text-zinc-500" />
          <span className="truncate">{event.venue}</span>
        </div>
      </div>
    </div>
  )
}
