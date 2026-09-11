import { useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getEventStatus, categoryMeta, parseLocalDate, STATUS } from '../data/events'
import StatusBadge from '../components/StatusBadge'
import CategoryBadge from '../components/CategoryBadge'
import CrowdBadge from '../components/CrowdBadge'
import TrustScore from '../components/TrustScore'
import NaverMap from '../components/NaverMap'
import { useEvents } from '../hooks/useEvents'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useBookmarks } from '../hooks/useBookmarks'
import { downloadEventIcs } from '../utils/ics'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import AdminEventForm from '../components/AdminEventForm'
import BoothManager from '../components/BoothManager'
import PerformerManager from '../components/PerformerManager'
import SectionCard from '../components/SectionCard'
import LiveCongestion from '../components/LiveCongestion'
import DirectionsButtons from '../components/DirectionsButtons'
import { ticketSiteName } from '../lib/ticketSite'
import PosterImage from '../components/PosterImage'

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { events, loading, error } = useEvents()
  const event = events.find(e => e.id === id)
  useDocumentTitle(event?.title)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const [imgError, setImgError] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)

  const handleDelete = async () => {
    if (!await confirm(`"${event?.title}" 행사를 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteEvent(event.id)
      navigate('/')
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-16 text-center text-zinc-400">
        <div className="text-4xl mb-3 animate-pulse">⏳</div>
        <p>행사 정보를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-16 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-zinc-400 mb-4">행사 정보를 찾을 수 없습니다</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← 목록으로</Link>
      </div>
    )
  }

  const status = getEventStatus(event)
  // 실시간 서울시 혼잡도는 행사가 "진행중"일 때만 의미가 있다 — 시작 전/종료 후에
  // 보여주면 행사와 무관한 그 장소의 평소 인파를 행사 혼잡도로 오해할 수 있다.
  const showingLiveCongestion = status === STATUS.ONGOING && !!event.seoulPlaceName
  const bookmarked = isBookmarked(event.id)
  const start = parseLocalDate(event.startDate)
  const end = parseLocalDate(event.endDate)
  const isSameDay = event.startDate === event.endDate

  const dateStr = isSameDay
    ? format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })
    : `${format(start, 'yyyy년 M월 d일 (eee)', { locale: ko })}\n~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`

  const hasCoords = event.venueLat != null && event.venueLng != null

  // 모바일 하단 고정 예매 바는 "실제로 누를 수 있을 때"만 띄운다 — 매진 행사에서는
  // 누를 수 없는 회색 "매진" 블록이 화면 아래를 계속 차지하기만 했다.
  // 바가 뜨는 동안에는 본문 CTA의 예매 버튼을 빼서 같은 버튼이 두 번 보이지 않게 한다.
  const showTicketBar = !!event.ticketUrl && event.ticketStatus !== 'soldout'

  const venueAddress = event.venueAddress ?? ''
  const venueName = event.venue ?? ''
  // 장소명에는 "코엑스 3층 D홀"처럼 행사 위치를 자세히 적어도 되지만, 지도에 넘길 때는
  // 홀·층을 떼고 "코엑스"만 남긴다 — 홀 번호가 붙은 문자열은 지도에서 검색이 안 돼
  // 엉뚱한 곳이 찍히거나 아무것도 안 나온다.
  const mapPlaceName = stripHallInfo(venueName) || venueName
  // 검색어는 도로명 주소를 우선한다(가장 정확). 주소가 없을 때만 정리된 장소명을 쓴다.
  const mapQuery = venueAddress || mapPlaceName
  // 좌표를 알고 있으면 지도 중심을 그 좌표로 고정한다 — 검색어가 애매해도(같은 이름의
  // 다른 지점 등) 실제 행사장 위치가 열리게 하는 안전장치.
  const naverMapUrl = hasCoords
    ? `https://map.naver.com/v5/search/${encodeURIComponent(mapQuery)}?c=${event.venueLng},${event.venueLat},15,0,0,0,dh`
    : `https://map.naver.com/v5/search/${encodeURIComponent(mapQuery)}`

  return (
    <div className={`max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10 lg:pb-10 ${showTicketBar ? 'pb-24' : 'pb-6'}`}>
      {/* 뒤로가기 */}
      <Link to="/" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-ink mb-6 transition-colors">
        ← 목록으로
      </Link>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
        <div className="lg:max-w-2xl">
          {/* 포스터 */}
          {event.posterUrl && !imgError ? (
            // 포스터 전체를 보여준다. 예전엔 object-cover + max-h라 세로형 포스터가
            // 가운데 띠만 남았다 — AGF 2026 포스터에서 제목과 하단 날짜·장소가 통째로
            // 잘려 나갔다(포스터는 그 정보가 그림 안에 인쇄돼 있다).
            <PosterImage
              src={event.posterUrl}
              alt={`${event.title} 포스터`}
              onError={() => setImgError(true)}
              className="w-full h-[360px] sm:h-[440px] lg:h-[480px] rounded-2xl mb-6"
            />
          ) : (
            <div className="w-full aspect-[16/7] rounded-2xl bg-gradient-to-br from-indigo-900/60 to-violet-900/40 mb-6 flex flex-col items-center justify-center gap-2">
              <span className="text-5xl leading-none">{categoryMeta(event.category).emoji}</span>
              <span className="text-sm text-zinc-300">공식 포스터 미정</span>
            </div>
          )}

          {/* 타이틀 영역 */}
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-start gap-2">
              <StatusBadge status={status} />
              <CategoryBadge category={event.category} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleBookmark(event.id)}
                aria-pressed={bookmarked}
                className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border text-lg transition-colors ${
                  bookmarked
                    ? 'bg-indigo-600/80 border-indigo-500/50 text-white'
                    : 'bg-ink/5 border-ink/10 text-zinc-400 hover:text-ink'
                }`}
              >
                {bookmarked ? '⭐' : '☆'}
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setShowEditForm(true)}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/40 text-sm transition-colors"
                    title="행사 수정"
                  >
                    ✏
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border bg-red-600/20 border-red-500/30 text-red-400 hover:bg-red-600/40 text-sm transition-colors"
                    title="행사 삭제"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          </div>

          {showEditForm && (
            <AdminEventForm event={event} onClose={() => setShowEditForm(false)} />
          )}
          <h1 className="text-2xl font-bold text-ink mb-1">{event.title}</h1>
          <p className="text-zinc-400 text-sm mb-6">{event.description}</p>

          {/* 기본 정보 카드 */}
          <div className="bg-ink/5 border border-ink/10 rounded-2xl p-4 space-y-3 mb-4">
            <InfoRow icon="📅" label="기간" value={dateStr} />
            {/* 주소가 없는 행사가 흔한데 템플릿 문자열로 이으면 "null"이 그대로 찍힌다 */}
            <InfoRow icon="📍" label="장소" value={[venueName, venueAddress].filter(Boolean).join('\n')} />
            <InfoRow icon="💰" label="입장료" value={event.admissionFee || '공식 미정'} />
            {event.crowdLevel && !showingLiveCongestion && status !== STATUS.ENDED && (
              <InfoRow
                icon="👥"
                label="예상 혼잡도"
                value={<CrowdBadge crowdLevel={event.crowdLevel} ticketStatus={event.ticketStatus} />}
                hint="실시간 데이터가 아닌, 과거 참가 규모·매진 여부 기반 추정치입니다"
              />
            )}
            <InfoRow icon="🏢" label="주최" value={event.organizer} />
            {event.ticketOpenDate && (
              <InfoRow
                icon="🎟"
                label="예매 오픈"
                value={[
                  format(new Date(event.ticketOpenDate.replaceAll('-', '/')), 'yyyy년 M월 d일', { locale: ko }),
                  event.ticketOpenTime,
                  ticketSiteName(event.ticketUrl),
                ].filter(Boolean).join(' · ')}
              />
            )}
            {event.ticketOpenNote && (
              <InfoRow icon="🗓" label="사전예매" value={event.ticketOpenNote} />
            )}
          </div>

          {/* 실시간 인구 혼잡도 (서울시 주요 120장소에 한함) */}
          <LiveCongestion placeName={showingLiveCongestion ? event.seoulPlaceName : null} />

          {/* 신뢰도 카드 */}
          <SectionCard title="행사 신뢰도">
            <TrustScore score={event.trustScore} pastEvents={event.pastEvents} />
          </SectionCard>

          {/* 출연진 · 세트리스트 / 무대 일정 (전 카테고리 — 콘서트는 세트리스트, 그 외는 무대 프로그램) */}
          <PerformerManager eventId={event.id} category={event.category} note={event.stageInfoNote} />

          {/* 부스 배치도 */}
          {event.floorPlanUrl && (
            <SectionCard title="🗺 부스 배치도">
              <img
                src={event.floorPlanUrl}
                alt={`${event.title} 부스 배치도`}
                className="w-full rounded-xl object-contain bg-ink/5"
              />
            </SectionCard>
          )}

          {/* 참가 업체 · 부스 */}
          <BoothManager eventId={event.id} note={event.boothInfoNote} />

          {/* 위치 & 경로 */}
          <div className="bg-ink/5 border border-ink/10 rounded-2xl overflow-hidden mb-4">
            {hasCoords && (
              <NaverMap
                lat={event.venueLat}
                lng={event.venueLng}
                venueName={venueName || mapPlaceName}
                linkUrl={naverMapUrl}
              />
            )}
            <div className="p-4">
              <h2 className="text-sm font-semibold text-ink mb-1">위치 & 경로</h2>
              {(venueName || venueAddress) && (
                <p className="text-xs text-zinc-400 mb-3 whitespace-pre-line">
                  {[venueName, venueAddress].filter(Boolean).join('\n')}
                </p>
              )}
              <DirectionsButtons
                lat={event.venueLat}
                lng={event.venueLng}
                placeName={mapPlaceName}
                fallbackQuery={mapQuery}
              />
            </div>
          </div>

          {/* 태그 */}
          {event.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {event.tags.map(tag => (
                <span key={tag} className="text-xs px-2.5 py-1 bg-ink/5 text-zinc-400 rounded-full border border-ink/10">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* CTA 버튼 — PC에서는 오른쪽 사이드바에 고정 표시되므로 모바일에서만 노출 */}
          <div className="lg:hidden">
            <CtaButtons event={event} showTicket={!showTicketBar} />
          </div>
        </div>

        {/* PC 전용 사이드바: 예매/캘린더 CTA를 스크롤해도 계속 보이게 고정 */}
        <div className="hidden lg:block lg:sticky lg:top-20">
          <CtaButtons event={event} />
        </div>
      </div>

      {/* 모바일 하단 고정 예매 바 — 페이지가 길어져도 예매하기가 항상 화면에 보이게 */}
      {showTicketBar && <TicketStickyBar event={event} />}
    </div>
  )
}

// 장소명에서 홀·층·전시장 번호를 제거해 지도 검색용 기본 장소명을 만든다.
// 예: "KINTEX 제2전시장 7·8홀" → "KINTEX", "코엑스 3층 D홀" → "코엑스"
function stripHallInfo(name) {
  return name
    .replace(/\s+제\d+전시장/g, '')
    .replace(/\s+[^\s]+홀/g, '')
    .replace(/\s+\d+층/g, '')
    .replace(/\s+B\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function InfoRow({ icon, label, value, hint }) {
  // 값이 비어 있으면(주최·장소 미등록 등) 라벨만 남은 빈 줄이 생기므로 아예 감춘다.
  if (value == null || value === '') return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 w-5">{icon}</span>
      <span className="text-zinc-400 shrink-0 w-20 whitespace-nowrap">{label}</span>
      <span className="text-zinc-200 whitespace-pre-line">
        {value}
        {hint && <span className="block text-xs text-zinc-400 mt-0.5">{hint}</span>}
      </span>
    </div>
  )
}

function ShareButton({ event }) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} | 게임이벤트허브`, url })
      } catch {
        // 사용자가 취소한 경우 무시
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // clipboard API 미지원 환경
      }
    }
  }, [event.title])

  return (
    <button
      onClick={handleShare}
      className="w-full py-3 bg-ink/10 hover:bg-ink/15 text-ink text-sm rounded-2xl text-center transition-colors"
    >
      {copied ? '✓ 링크 복사됨!' : '🔗 공유하기'}
    </button>
  )
}

// 예매 버튼 — 사이드바/모바일 인라인 CTA와 하단 고정 바(TicketStickyBar)가 공유한다.
function TicketButton({ event, className }) {
  if (!event.ticketUrl) return null
  if (event.ticketStatus === 'soldout') {
    return (
      <div className={`bg-zinc-800 text-zinc-400 font-semibold text-center select-none ${className}`}>
        🎟 매진
      </div>
    )
  }
  return (
    <a
      href={event.ticketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-center transition-colors shadow-lg shadow-indigo-900/50 ${className}`}
    >
      🎟 {event.ticketStatus === 'available' ? '예매하기' : '예매 페이지'}
      {ticketSiteName(event.ticketUrl) && ` (${ticketSiteName(event.ticketUrl)})`}
    </a>
  )
}

// 모바일 전용 하단 고정 CTA — 카드가 많이 쌓이는 행사(부스·출연진·지도까지)는 스크롤이
// 길어져서, "예매하기"가 화면 맨 아래에 파묻히지 않게 항상 보이는 바를 따로 둔다.
// 띄울지 말지(예매 링크 없음·매진)는 호출부의 showTicketBar가 판단한다.
function TicketStickyBar({ event }) {
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-ink/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <TicketButton event={event} className="block w-full py-3 rounded-xl text-sm" />
    </div>
  )
}

function CtaButtons({ event, showTicket = true }) {
  return (
    <div className="flex flex-col gap-2">
      {showTicket && <TicketButton event={event} className="w-full py-3.5 rounded-2xl" />}
      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-ink/10 hover:bg-ink/15 text-ink text-sm rounded-2xl text-center transition-colors"
        >
          공식 사이트 →
        </a>
      )}
      <button
        onClick={() => downloadEventIcs(event)}
        className="w-full py-3 bg-ink/10 hover:bg-ink/15 text-ink text-sm rounded-2xl text-center transition-colors"
      >
        📅 캘린더에 추가 (.ics)
      </button>
      <ShareButton event={event} />
    </div>
  )
}
