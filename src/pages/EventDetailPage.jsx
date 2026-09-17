import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format, differenceInCalendarDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { getEventStatus, getDaysUntil, parseLocalDate, STATUS } from '../data/events'
import StatusBadge from '../components/StatusBadge'
import CategoryBadge from '../components/CategoryBadge'
import CrowdBadge from '../components/CrowdBadge'
import TrustScore from '../components/TrustScore'
import NaverMap from '../components/NaverMap'
import Icon from '../components/icons'
import { FOCUS_RING } from '../components/ui/focusRing'
import { useEvent } from '../hooks/useEvent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import AdminEventForm from '../components/AdminEventForm'
import BoothList from '../components/BoothList'
import GoodsGrid from '../components/GoodsGrid'
import StageTimeline from '../components/StageTimeline'
import CosplayerGrid from '../components/CosplayerGrid'
import OverviewSummary from '../components/OverviewSummary'
import PerformerManager from '../components/PerformerManager'
import SectionCard from '../components/SectionCard'
import Tabs from '../components/Tabs'
import EventPoster from '../components/EventPoster'
import FloorPlan from '../components/FloorPlan'
import EventActions from '../components/EventActions'
import EventCta from '../components/EventCta'
import FactTiles from '../components/FactTiles'
import DetailSkeleton from '../components/DetailSkeleton'
import { useEventBooths } from '../hooks/useEventBooths'
import { useEventBoothItems } from '../hooks/useEventBoothItems'
import { useEventPerformers } from '../hooks/useEventPerformers'
import { useEventStages } from '../hooks/useEventStages'
import { useEventCosplayers } from '../hooks/useEventCosplayers'
import { useEventTabs } from '../hooks/useEventTabs'
import { mergeTabs, hiddenBuiltinKeys } from '../lib/tabConfig'
import CustomTab from '../components/CustomTab'
import ReportSheet from '../components/ReportSheet'
import LiveCongestion from '../components/LiveCongestion'
import DirectionsButtons from '../components/DirectionsButtons'
import { ticketSiteName } from '../lib/ticketSite'
import { operatorLabel, priceRangeLabel } from '../lib/boothKinds'

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  // 목록(useEvents)이 아니라 id로 이 행사만 받아온다 — 목록은 "올해 + 90일"만 담아서
  // 그 범위 밖 행사는 링크로 들어와도 못 찾는 상태였다 (useEvent.js 주석 참고).
  const { event, loading, error } = useEvent(id)
  useDocumentTitle(event?.title)
  // 하위 목록은 여기서 한 번만 받아 아래로 내려준다 — 어떤 탭을 띄울지는 "내용이 있는가"로
  // 정해지므로 페이지가 개수를 먼저 알아야 하고, 컴포넌트마다 따로 조회하면 같은 테이블에
  // 같은 이름의 실시간 채널이 두 번 열린다.
  const { booths } = useEventBooths(id)
  const { items: boothItems } = useEventBoothItems(id)
  const { performers } = useEventPerformers(id)
  const { stages, slots } = useEventStages(id)
  const { cosplayers } = useEventCosplayers(id)
  // 관리자가 정한 탭 구성. 행이 없으면 빈 배열이고, 화면은 지금까지와 똑같이 그려진다.
  const { tabs: tabConfig } = useEventTabs(id)
  const { toast, confirm } = useUIFeedback()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showReport, setShowReport] = useState(false)
  // 탭을 페이지가 들고 있어야 탭끼리 서로를 가리킬 수 있다 — 부스 카드의
  // "굿즈 탭 →", 굿즈 사진의 "이 부스로", 무대 줄의 부스 배지가 전부 이걸 쓴다.
  const [tab, setTab] = useState('overview')
  const [focusBoothId, setFocusBoothId] = useState(null)

  const jumpTo = (tabId, boothId = null) => {
    setTab(tabId)
    setFocusBoothId(boothId)
    // 탭바는 sticky라 화면에 남지만, 긴 탭에서 넘어오면 내용이 한참 아래에서 시작한다.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 다른 행사로 이동해도 이 컴포넌트는 언마운트되지 않는다(같은 라우트, id만 바뀜).
  // 열어둔 수정 폼을 비워주지 않으면 엉뚱한 행사의 폼으로 이어진다.
  // (렌더 도중에 되돌리는 React 공식 패턴 — 이펙트로 하면 잘못된 화면이 한 번 그려진다.)
  const [renderedId, setRenderedId] = useState(id)
  if (renderedId !== id) {
    setRenderedId(id)
    setShowEditForm(false)
    setTab('overview')
    setFocusBoothId(null)
  }

  const handleDelete = async () => {
    if (!await confirm(`"${event?.title}" 행사를 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteEvent(event.id)
      navigate('/')
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  if (loading) return <DetailSkeleton />

  if (error || !event) {
    return (
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-16 text-center">
        <Icon name="search" className="w-10 h-10 mx-auto mb-4 text-zinc-500" />
        <p className="text-zinc-400 mb-4">행사 정보를 찾을 수 없습니다</p>
        <Link to="/" className={`text-indigo-400 hover:text-indigo-300 text-sm rounded ${FOCUS_RING}`}>← 목록으로</Link>
      </div>
    )
  }

  const status = getEventStatus(event)
  // 실시간 서울시 혼잡도는 행사가 "진행중"일 때만 의미가 있다 — 시작 전/종료 후에
  // 보여주면 행사와 무관한 그 장소의 평소 인파를 행사 혼잡도로 오해할 수 있다.
  const showingLiveCongestion = status === STATUS.ONGOING && !!event.seoulPlaceName
  const start = parseLocalDate(event.startDate)
  const end = parseLocalDate(event.endDate)
  const isSameDay = event.startDate === event.endDate
  const dayCount = differenceInCalendarDays(end, start) + 1

  const dateValue = isSameDay
    ? format(start, 'M.d (eee)', { locale: ko })
    : `${format(start, 'M.d (eee)', { locale: ko })} – ${format(end, 'M.d (eee)', { locale: ko })}`
  const dateHint = isSameDay
    ? format(start, 'yyyy년', { locale: ko })
    : `${format(start, 'yyyy년', { locale: ko })} · ${dayCount}일간`

  const daysUntil = status === STATUS.UPCOMING ? getDaysUntil(event) : null
  const dDayLabel = daysUntil === null ? null : daysUntil === 0 ? 'D-Day' : daysUntil > 0 ? `D-${daysUntil}` : null

  const hasCoords = event.venueLat != null && event.venueLng != null
  const siteName = ticketSiteName(event.ticketUrl)

  // 예매 안내. 아는 만큼 적고, 모르면 모른다고 적는다 — 예전엔 날짜가 없으면 줄 자체가
  // 사라져서 "원래 예매가 없는 행사"인지 "아직 안 정해진 것"인지 구분되지 않았다.
  const ticketValue = event.ticketStatus === 'soldout' ? '매진'
    : event.ticketOpenDate
      ? `${format(new Date(event.ticketOpenDate.replaceAll('-', '/')), 'M.d', { locale: ko })} 오픈`
      : event.ticketUrl ? '예매 진행 중' : '미정'
  const ticketHint = event.ticketStatus === 'soldout' ? (siteName || null)
    : event.ticketOpenDate
      ? [event.ticketOpenTime ?? '시간 미정', siteName].filter(Boolean).join(' · ')
      : event.ticketUrl ? (siteName || null) : '공식 발표 전'

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

  // 핵심 정보 네 칸. 넷으로 고정해야 2열(모바일)·4열(PC) 어느 쪽이든 빈자리가 없다.
  // 마지막 칸만 상황에 따라 바뀐다 — 열리고 있는 행사에서는 혼잡도가, 그 외에는
  // 주최사가 더 알고 싶은 정보다.
  const lastTile = status === STATUS.ONGOING && event.crowdLevel
    ? {
        icon: 'users',
        label: '예상 혼잡도',
        value: <CrowdBadge crowdLevel={event.crowdLevel} ticketStatus={event.ticketStatus} />,
        hint: '실시간 아님 · 추정',
      }
    : { icon: 'info', label: '주최', value: event.organizer || '미정' }

  const tiles = [
    { icon: 'calendar', label: '기간', value: dateValue, hint: dateHint },
    { icon: 'won', label: '입장료', value: event.admissionFee || '공식 미정' },
    { icon: 'ticket', label: '예매', value: ticketValue, hint: ticketHint },
    lastTile,
  ]

  // ── 탭 구성 ────────────────────────────────────────────────────────────
  // 탭은 데이터가 정한다. 부스도 굿즈도 없는 행사(대부분이 그렇다)에서는 탭이 "개요"
  // 하나만 남고, Tabs가 그때는 탭바를 그리지 않아 한 장짜리 화면이 된다.
  //
  // 다만 탭이 안 생긴다고 그 정보가 사라지면 안 된다 — 이 화면은 "등록된 게 없다"와
  // "화면이 원래 다르다"를 구분할 수 있게 빈 섹션도 자리를 지킨다는 원칙으로 만들어져
  // 있다(BoothList·PerformerManager의 DisclosureNote). 그래서 탭이 없을 때는 해당
  // 섹션을 개요 안으로 내린다.
  const goodsItems = boothItems.filter(item => item.kind === 'goods')
  // 게임음악 행사의 "출연진·세트리스트"는 시간표가 아니라 라인업이라 성격이 다르다.
  // 그쪽은 예전 구조(event_performers)를 그대로 쓰고, 나머지 행사만 시간표를 쓴다.
  const isConcert = event.category === '게임음악'
  // 관리자가 명시적으로 끈 탭. "데이터가 없어서 탭이 안 생긴 것"과 구분해야 한다 —
  // 전자는 개요 아래에도 넣지 않고, 후자는 넣는다.
  const hiddenTabKeys = hiddenBuiltinKeys(tabConfig)
  const hasBoothTab = booths.length > 0 || !!event.floorPlanUrl || !!event.floorPlanNote
  const hasStageTab = isConcert ? performers.length > 0 : slots.length > 0
  const hasGoodsTab = goodsItems.length > 0 || !!event.goodsInfoNote
  const hasCosplayTab = cosplayers.length > 0 || !!event.cosplayInfoNote

  const boothSection = (
    <>
      {/* 배치도는 부스 목록 위에 온다 — 현장에서는 "어디로 가야 하나"가 먼저다.
          아직 안 나온 행사에서는 언제 어디에 올라오는지 안내가 그 자리를 지킨다. */}
      <FloorPlan event={event} />
      <BoothList
        eventId={event.id}
        booths={booths}
        items={boothItems}
        note={event.boothInfoNote}
        stages={stages}
        slots={slots}
        cosplayers={cosplayers}
        onJump={jumpTo}
      />
    </>
  )
  const stageSection = isConcert ? (
    <PerformerManager
      eventId={event.id}
      category={event.category}
      note={event.stageInfoNote}
      performers={performers}
    />
  ) : (
    <StageTimeline
      eventId={event.id}
      stages={stages}
      slots={slots}
      booths={booths}
      cosplayers={cosplayers}
      note={event.stageInfoNote}
      onJump={jumpTo}
    />
  )
  const goodsSection = (
    <GoodsGrid
      items={boothItems}
      booths={booths}
      note={event.goodsInfoNote}
      focusBoothId={focusBoothId}
      onJump={jumpTo}
    />
  )
  const cosplaySection = (
    <CosplayerGrid
      eventId={event.id}
      cosplayers={cosplayers}
      booths={booths}
      note={event.cosplayInfoNote}
      focusBoothId={focusBoothId}
      onJump={jumpTo}
    />
  )

  // 개요 맨 위의 안내판. 탭이 다섯이 되면 개요는 "나머지 전부"가 아니라 입구다.
  const summaryTiles = [
    { tab: 'booths', icon: 'store', label: '참가 부스', count: booths.length,
      value: `${booths.length}곳`, hint: boothBreakdown(booths), note: event.boothInfoNote },
    { tab: 'stage', icon: 'calendar', label: isConcert ? '출연진' : '무대 프로그램',
      count: isConcert ? performers.length : slots.length,
      value: isConcert ? `${performers.length}팀` : `${slots.length}개`,
      hint: isConcert ? null : stageBreakdown(stages, slots), note: event.stageInfoNote },
    { tab: 'goods', icon: 'won', label: '굿즈', count: goodsItems.length,
      value: `${goodsItems.length}종`, hint: priceRangeLabel(goodsItems), note: event.goodsInfoNote },
    { tab: 'cosplay', icon: 'users', label: '코스어', count: cosplayers.length,
      value: `${cosplayers.length}명`, hint: cosplayBreakdown(cosplayers), note: event.cosplayInfoNote },
  ]


  const baseTabs = [
    {
      id: 'overview',
      label: '개요',
      render: () => (
        <>
          <OverviewSummary tiles={summaryTiles} onJump={jumpTo} />

          {/* 위치 & 경로 — 지도는 요약 바로 아래다.
              예전엔 신뢰도·부스·무대를 전부 지나야 나오는 맨 아래였는데, 행사 당일에
              가장 자주 여는 정보가 가장 깊은 곳에 있었던 셈이다. */}
          <div className="bg-surface-1 border border-line rounded-2xl overflow-hidden mb-4">
            {hasCoords && (
              <NaverMap
                lat={event.venueLat}
                lng={event.venueLng}
                venueName={venueName || mapPlaceName}
                linkUrl={naverMapUrl}
              />
            )}
            <div className="p-4">
              <h2 className="text-sm font-semibold text-ink mb-0.5">{venueName || '장소 미정'}</h2>
              {venueAddress && <p className="text-xs text-zinc-400 mb-3">{venueAddress}</p>}
              <DirectionsButtons
                lat={event.venueLat}
                lng={event.venueLng}
                placeName={mapPlaceName}
                fallbackQuery={mapQuery}
              />
            </div>
          </div>

          {/* 실시간 인구 혼잡도 (서울시 주요 120장소에 한함) */}
          <LiveCongestion placeName={showingLiveCongestion ? event.seoulPlaceName : null} />

          {/* 점수도 이력도 없으면 카드 자체를 안 그린다 — "행사 신뢰도"라는 제목만
              달린 빈 상자는 알려주는 게 없으면서 자리만 차지한다. */}
          {(typeof event.trustScore === 'number' || event.pastEvents?.length > 0) && (
            <SectionCard title="행사 신뢰도">
              <TrustScore score={event.trustScore} pastEvents={event.pastEvents} />
            </SectionCard>
          )}

          {/* 탭으로 갈라지지 않은 섹션은 여기 남는다 — 탭이 안 생겼다고 정보가
              사라지면 안 된다("등록된 게 없다"와 "화면이 원래 다르다"는 다르다). */}
          {!hasStageTab && !hiddenTabKeys.has('stage') && stageSection}
          {!hasBoothTab && !hiddenTabKeys.has('booths') && boothSection}
          {!hasGoodsTab && !hiddenTabKeys.has('goods') && goodsSection}
          {!hasCosplayTab && !hiddenTabKeys.has('cosplay') && cosplaySection}

          {/* 자주 찾지는 않지만 있어야 하는 것들. 팩트 타일에서 밀려난 값이 여기 모인다. */}
          {(event.organizer || event.ticketOpenNote || event.tags?.length > 0) && (
            <SectionCard title="주최 · 기타">
              <dl className="flex flex-col gap-2 text-sm">
                {event.organizer && (
                  <div className="flex gap-3">
                    <dt className="text-zinc-400 w-20 shrink-0">주최</dt>
                    <dd className="text-zinc-200 min-w-0">{event.organizer}</dd>
                  </div>
                )}
                {event.ticketOpenNote && (
                  <div className="flex gap-3">
                    <dt className="text-zinc-400 w-20 shrink-0">사전예매</dt>
                    <dd className="text-zinc-200 min-w-0">{event.ticketOpenNote}</dd>
                  </div>
                )}
              </dl>
              {event.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {/* 태그는 지금까지 장식이었다. 누르면 그 태그가 붙은 행사를 찾아준다 —
                      filterBySearch가 이미 태그까지 훑고 있어서(data/events.js) 검색어로
                      넘기기만 하면 된다. 목록은 기본 상태(예정)로 열린다. */}
                  {event.tags.map(tag => (
                    <Link
                      key={tag}
                      to={{ pathname: '/', search: `?q=${encodeURIComponent(tag)}` }}
                      className={`text-xs px-2.5 py-1 bg-surface-2 text-zinc-400 hover:text-ink rounded-full transition-colors ${FOCUS_RING}`}
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* 틀린 정보를 발견해도 알려줄 곳이 없었다. 개요 맨 아래에 둔다 —
              위쪽에 두면 정보보다 먼저 눈에 띄어서, 읽기도 전에 신고부터 권하는 꼴이 된다. */}
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className={`w-full flex items-center justify-center gap-1.5 py-3 text-xs text-zinc-400 hover:text-ink transition-colors rounded-xl ${FOCUS_RING}`}
          >
            <Icon name="warn" className="w-3.5 h-3.5" />
            이 행사 정보가 틀렸나요?
          </button>
        </>
      ),
    },
    hasBoothTab && {
      id: 'booths',
      label: '부스',
      count: booths.length,
      render: () => boothSection,
    },
    hasStageTab && {
      id: 'stage',
      label: isConcert ? '출연진' : '무대',
      count: isConcert ? performers.length : slots.length,
      render: () => stageSection,
    },
    hasGoodsTab && {
      id: 'goods',
      label: '굿즈',
      count: goodsItems.length,
      render: () => goodsSection,
    },
    hasCosplayTab && {
      id: 'cosplay',
      label: '코스프레',
      count: cosplayers.length,
      render: () => cosplaySection,
    },
  ].filter(Boolean)

  // 관리자가 정한 탭 구성(이름·순서·표시)과 직접 만든 탭을 얹는다.
  // event_tabs에 행이 없으면 baseTabs가 그대로 나온다 — 지금까지와 똑같다.
  const { tabs } = mergeTabs(baseTabs, tabConfig, tab => <CustomTab tab={tab} />)

  const backLink = (
    <Link to="/" className={`flex items-center gap-1.5 text-sm text-zinc-400 hover:text-ink transition-colors rounded ${FOCUS_RING}`}>
      <Icon name="back" className="w-4 h-4" />
      목록으로
    </Link>
  )

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-4 lg:py-10 pb-24 lg:pb-10">
      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-x-8 lg:items-start">
        {/* 왼쪽 기둥 — 스크롤해도 따라온다. 좁은 화면에서는 그냥 맨 위 포스터다. */}
        <div className="lg:sticky lg:top-20 flex flex-col gap-3 mb-4 lg:mb-0">
          <div className="relative">
            <EventPoster event={event} />
            {/* 좁은 화면에서는 뒤로가기·조작을 포스터 위에 얹는다 — 별도 줄로 빼면
                첫 화면에서 40px을 더 쓰게 되고, 그만큼 제목이 아래로 밀린다. */}
            <div className="lg:hidden absolute top-2 inset-x-2 z-10 flex items-start justify-between gap-2 pointer-events-none">
              <Link
                to="/"
                aria-label="목록으로"
                className={`pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/45 backdrop-blur border border-white/15 text-white hover:bg-black/60 transition-colors ${FOCUS_RING}`}
              >
                <Icon name="back" className="w-[18px] h-[18px]" />
              </Link>
              <div className="pointer-events-auto">
                <EventActions event={event} onEdit={() => setShowEditForm(true)} onDelete={handleDelete} overlay />
              </div>
            </div>
          </div>

          {/* PC에서는 CTA가 포스터 아래 기둥에 붙어 따라 내려온다. 좁은 화면용 CTA는
              아래 본문 흐름 안에 따로 있다(같은 버튼이 두 번 보이지 않게 서로 가린다). */}
          <div className="hidden lg:block">
            <EventCta event={event} withBar={false} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="hidden lg:flex items-center justify-between gap-3 mb-4">
            {backLink}
            <EventActions event={event} onEdit={() => setShowEditForm(true)} onDelete={handleDelete} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <CategoryBadge category={event.category} />
            {status !== STATUS.UPCOMING && <StatusBadge status={status} />}
            {dDayLabel && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap ${
                daysUntil <= 7 ? 'bg-indigo-600 text-white' : 'bg-surface-2 text-zinc-300'
              }`}>
                {dDayLabel}
              </span>
            )}
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold text-ink tracking-tight leading-tight mb-1.5">{event.title}</h1>
          {venueName && (
            <p className="flex items-center gap-1.5 text-sm text-zinc-400 mb-4">
              <Icon name="pin" className="w-4 h-4 text-zinc-500" />
              <span className="min-w-0">{venueName}</span>
            </p>
          )}

          <FactTiles tiles={tiles} />

          <div className="lg:hidden mb-5">
            <EventCta event={event} />
          </div>

          {event.description && <Description text={event.description} />}

          {showEditForm && (
            <AdminEventForm event={event} onClose={() => setShowEditForm(false)} />
          )}
          {showReport && (
            <ReportSheet kind="correction" event={event} onClose={() => setShowReport(false)} />
          )}

          <Tabs
            tabs={tabs}
            idPrefix={`ev-${event.id}`}
            activeId={tabs.some(t => t.id === tab) ? tab : tabs[0]?.id}
            onChange={next => { setTab(next); setFocusBoothId(null) }}
          />
        </div>
      </div>
    </div>
  )
}

// 행사 설명. 긴 설명이 핵심 정보를 밀어내지 않도록 두 줄만 보여주고 접는다.
function Description({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-5">
      <p className={`text-sm text-zinc-400 leading-relaxed ${open ? '' : 'line-clamp-2'}`}>{text}</p>
      {/* 두 줄이 안 되는 짧은 설명에도 버튼이 뜨지만, 눌러도 화면이 바뀌지 않을 뿐
          잘못된 정보를 주지는 않는다. 실제 줄 수를 재려면 레이아웃을 한 번 그린 뒤
          측정해야 해서, 그 복잡도를 감수할 만큼의 이득이 아니다. */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className={`mt-1 text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}
      >
        {open ? '접기' : '더보기'}
      </button>
    </div>
  )
}

// 요약 안내판의 둘째 줄. "36곳"만으로는 어떤 행사인지 모르지만 "기업 24 · 창작자 8"이면 안다.
function boothBreakdown(booths) {
  const counts = ['company', 'creator', 'host']
    .map(op => ({ op, n: booths.filter(b => b.operator === op).length }))
    .filter(c => c.n > 0)
  if (counts.length < 2) return null
  return counts.map(c => `${operatorLabel(c.op)} ${c.n}`).join(' · ')
}

function stageBreakdown(stages, slots) {
  const days = new Set(slots.map(s => s.day)).size
  const parts = []
  if (stages.length > 1) parts.push(`무대 ${stages.length}곳`)
  if (days > 1) parts.push(`${days}일간`)
  return parts.join(' · ') || null
}

function cosplayBreakdown(cosplayers) {
  const host = cosplayers.filter(c => !c.boothId).length
  const booth = cosplayers.length - host
  if (host === 0 || booth === 0) return null
  return `주최 ${host} · 부스 ${booth}`
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
