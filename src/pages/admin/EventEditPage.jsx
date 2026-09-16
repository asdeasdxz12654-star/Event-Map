import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/icons'
import Skeleton from '../../components/ui/Skeleton'
import AdminEventForm from '../../components/AdminEventForm'
import BoothList from '../../components/BoothList'
import GoodsGrid from '../../components/GoodsGrid'
import StageTimeline from '../../components/StageTimeline'
import CosplayerGrid from '../../components/CosplayerGrid'
import PerformerManager from '../../components/PerformerManager'
import { useEvent } from '../../hooks/useEvent'
import { useEventBooths } from '../../hooks/useEventBooths'
import { useEventBoothItems } from '../../hooks/useEventBoothItems'
import { useEventStages } from '../../hooks/useEventStages'
import { useEventCosplayers } from '../../hooks/useEventCosplayers'
import { useEventPerformers } from '../../hooks/useEventPerformers'
import { useEventTabs } from '../../hooks/useEventTabs'
import TabConfigEditor from '../../components/admin/TabConfigEditor'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'
import { adminApi } from '../../lib/adminApi'
import { CATEGORIES, STATUS, getEventStatus } from '../../data/events'
import { FOCUS_RING } from '../../components/ui/focusRing'

// 행사 하나를 고치는 화면.
//
// 탭 구성을 상세페이지와 같게 맞춘다
//   그리고 탭 안에는 상세페이지가 쓰는 바로 그 컴포넌트를 넣는다. 관리자용으로 표를
//   따로 만들면 "고친 결과가 실제로 어떻게 보이는지"를 확인하려고 매번 상세페이지를
//   열어야 하고, 두 화면의 규칙이 조금씩 갈라진다. 굿즈 사진처럼 생김새가 전부인
//   데이터에서는 특히 그렇다.
//
//   그 컴포넌트들은 이미 useAdmin()으로 편집 UI를 켠다 — 여기서는 문(AdminGate)을
//   이미 지났으므로 전부 켜진 상태로 나온다.
const TABS = [
  { id: 'basic', label: '기본정보' },
  { id: 'booths', label: '부스' },
  { id: 'goods', label: '굿즈' },
  { id: 'stage', label: '무대' },
  { id: 'cosplay', label: '코스어' },
  { id: 'tabs', label: '탭 구성' },
]

export default function EventEditPage() {
  const { id } = useParams()
  // /admin/events/new 는 id가 없다 — 폼만 띄우고, 저장되면 만들어진 행사로 옮긴다.
  return id ? <EditScreen id={id} /> : <NewScreen />
}

function NewScreen() {
  useDocumentTitle('행사 추가')
  const navigate = useNavigate()
  return (
    <div>
      <BackLink />
      <h2 className="text-lg font-semibold text-ink mb-3">행사 추가</h2>
      <p className="text-sm text-zinc-400 mb-4">
        제목 · 시작일 · 종료일만 있으면 만들 수 있습니다. 나머지는 나중에 채워도 됩니다.
      </p>
      <AdminEventForm
        onClose={() => navigate('/admin/events')}
        onSaved={() => navigate('/admin/events')}
      />
    </div>
  )
}

function EditScreen({ id }) {
  const navigate = useNavigate()
  const { toast, confirm } = useUIFeedback()
  const { event, loading, error } = useEvent(id)
  const { booths } = useEventBooths(id)
  const { items } = useEventBoothItems(id)
  const { stages, slots } = useEventStages(id)
  const { cosplayers } = useEventCosplayers(id)
  const { performers } = useEventPerformers(id)
  const { tabs: tabConfig } = useEventTabs(id)
  const [tab, setTab] = useState('basic')
  const [editing, setEditing] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  useDocumentTitle(event ? `${event.title} 편집` : '행사 편집')

  if (loading) return <EditSkeleton />

  if (error || !event) {
    return (
      <div className="text-center py-16">
        <BackLink />
        <Icon name="search" className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
        <p className="text-sm text-zinc-400">행사를 찾을 수 없습니다</p>
      </div>
    )
  }

  const remove = async () => {
    if (!await confirm(`"${event.title}" 행사를 삭제하시겠습니까? 부스·굿즈·무대·코스어가 함께 지워집니다.`)) return
    try {
      await adminApi.deleteEvent(event.id)
      navigate('/admin/events')
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const unlock = async () => {
    setUnlocking(true)
    try {
      await adminApi.unlockEvent(event.id)
      // useEvent가 실시간 구독 중이라 화면은 알아서 따라온다.
      toast('크롤러 자동 갱신을 다시 켰습니다.', { type: 'success' })
    } catch (err) {
      toast(`실패: ${err.message}`)
    } finally {
      setUnlocking(false)
    }
  }

  const isConcert = event.category === CATEGORIES.CONCERT
  const goodsItems = items.filter(i => i.kind === 'goods')

  return (
    <div>
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-ink leading-snug min-w-0">{event.title}</h2>
        <div className="shrink-0 flex items-center gap-1.5">
          <Link
            to={`/events/${encodeURIComponent(event.id)}`}
            className={`flex items-center gap-1 text-xs text-zinc-400 hover:text-ink px-2.5 py-1.5 rounded-lg bg-surface-2 transition-colors ${FOCUS_RING}`}
          >
            <Icon name="external" className="w-3.5 h-3.5" />
            상세페이지
          </Link>
          <button
            type="button"
            onClick={remove}
            className={`flex items-center gap-1 text-xs text-danger/90 hover:text-danger px-2.5 py-1.5 rounded-lg bg-danger/10 transition-colors ${FOCUS_RING}`}
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            삭제
          </button>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 mb-3">
        <StatusText status={getEventStatus(event)} />
        <span className="tabular-nums">{event.startDate}{event.endDate !== event.startDate && ` ~ ${event.endDate}`}</span>
        {event.venue && <>· {event.venue}</>}
        <span className="font-mono text-zinc-600">{event.id}</span>
      </p>

      <LockNotice event={event} onUnlock={unlock} busy={unlocking} />

      <div
        role="tablist"
        aria-label="편집 영역"
        className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-line mb-4 -mx-4 px-4 lg:mx-0 lg:px-0"
      >
        {TABS.map(t => {
          const on = t.id === tab
          const count = {
            booths: booths.length,
            goods: goodsItems.length,
            stage: isConcert ? performers.length : slots.length,
            cosplay: cosplayers.length,
            // 탭 구성은 "설정한 개수"라 0이 정상이다. 숫자를 안 보여준다.
            tabs: null,
          }[t.id]
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${FOCUS_RING} ${
                on ? 'border-indigo-500 text-ink font-semibold' : 'border-transparent text-zinc-400 hover:text-ink'
              }`}
            >
              {isConcert && t.id === 'stage' ? '출연진' : t.label}
              {count != null && (
                <span className={`ml-1.5 text-xs tabular-nums ${count > 0 ? 'text-zinc-500' : 'text-zinc-700'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'basic' && <BasicTab event={event} onEdit={() => setEditing(true)} />}
      {tab === 'booths' && (
        <BoothList
          eventId={event.id}
          booths={booths}
          items={items}
          note={event.boothInfoNote}
          stages={stages}
          slots={slots}
          cosplayers={cosplayers}
        />
      )}
      {tab === 'goods' && <GoodsGrid items={items} booths={booths} note={event.goodsInfoNote} />}
      {tab === 'stage' && (
        isConcert
          ? <PerformerManager eventId={event.id} category={event.category} note={event.stageInfoNote} performers={performers} />
          : <StageTimeline eventId={event.id} stages={stages} slots={slots} booths={booths} cosplayers={cosplayers} note={event.stageInfoNote} />
      )}
      {tab === 'cosplay' && (
        <CosplayerGrid eventId={event.id} cosplayers={cosplayers} booths={booths} note={event.cosplayInfoNote} />
      )}

      {tab === 'tabs' && <TabConfigEditor eventId={event.id} config={tabConfig} />}

      {editing && <AdminEventForm event={event} onClose={() => setEditing(false)} />}
    </div>
  )
}

// 크롤러가 이 행사를 건너뛰고 있다는 사실과, 되돌리는 문.
//
// 이 상태를 화면 어디에서도 볼 수 없었다. 제목 오타 하나를 고치면 그 행사는 이후
// 공식이 포스터·예매 링크를 올려도 영영 자동으로 안 채워지는데, 그걸 아는 방법이
// 크롤러 소스를 읽는 것뿐이었다.
function LockNotice({ event, onUnlock, busy }) {
  if (!event.adminEditedAt) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-warn/10 border border-warn/25 rounded-xl px-3.5 py-2.5 mb-4">
      <Icon name="key" className="w-4 h-4 shrink-0 text-warn" />
      <p className="text-xs text-zinc-300 min-w-0 flex-1 leading-relaxed">
        <span className="font-semibold text-ink">크롤러 자동 갱신 꺼짐</span>
        <span className="block text-zinc-400 mt-0.5">
          직접 수정한 행사라 크롤러가 건드리지 않습니다. 내가 넣은 값은 안전하지만,
          공식이 나중에 포스터·예매 링크를 올려도 자동으로 채워지지 않습니다.
        </span>
      </p>
      <button
        type="button"
        onClick={onUnlock}
        disabled={busy}
        className={`shrink-0 text-xs font-medium px-3 py-1.5 bg-surface-2 hover:bg-line disabled:opacity-50 text-ink rounded-lg transition-colors ${FOCUS_RING}`}
      >
        {busy ? '켜는 중...' : '다시 켜기'}
      </button>
    </div>
  )
}

// 기본정보는 읽기로 보여주고 고치기는 기존 폼(AdminEventForm)을 띄운다.
//
// 폼을 여기 다시 그리지 않는 이유: 27개 입력칸과 그 검증이 이미 그 파일에 있다.
// 복제하면 둘이 갈라지고, 갈라진 쪽이 조용히 틀린 값을 저장하기 시작한다.
// 대신 읽기 화면에서 "빈 칸"을 눈에 띄게 적는다 — 무엇을 채워야 하는지가 이 화면의 일이다.
function BasicTab({ event, onEdit }) {
  const rows = [
    ['카테고리', event.category],
    ['기간', `${event.startDate} ~ ${event.endDate}`],
    ['장소', event.venue],
    ['주소', event.venueAddress],
    ['좌표', event.venueLat != null ? `${event.venueLat}, ${event.venueLng}` : null],
    ['주최', event.organizer],
    ['입장료', event.admissionFee],
    ['예매 링크', event.ticketUrl],
    ['예매 오픈', [event.ticketOpenDate, event.ticketOpenTime].filter(Boolean).join(' ') || null],
    ['공식 사이트', event.website],
    ['포스터', event.posterUrl],
    ['배치도', event.floorPlanUrl ?? event.floorPlanNote],
    ['부스 공개 상태', event.boothInfoNote],
    ['무대 공개 상태', event.stageInfoNote],
    ['굿즈 공개 상태', event.goodsInfoNote],
    ['코스어 공개 상태', event.cosplayInfoNote],
    ['신뢰도', event.trustScore != null ? `${event.trustScore} / 5` : null],
    ['태그', event.tags?.length ? event.tags.join(', ') : null],
  ]

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={onEdit}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors ${FOCUS_RING}`}
        >
          <Icon name="edit" className="w-3.5 h-3.5" />
          기본정보 수정
        </button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line border border-line rounded-2xl overflow-hidden">
        {rows.map(([label, value]) => (
          <div key={label} className="bg-surface-1 px-3.5 py-2.5 min-w-0">
            <dt className="text-[11px] text-zinc-500 mb-1">{label}</dt>
            <dd className={`text-sm break-all ${value ? 'text-zinc-200' : 'text-zinc-600'}`}>
              {value || '비어 있음'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function StatusText({ status }) {
  const meta = {
    [STATUS.ONGOING]: ['진행중', 'text-live'],
    [STATUS.UPCOMING]: ['예정', 'text-indigo-400'],
    [STATUS.ENDED]: ['종료', 'text-zinc-600'],
  }[status]
  return <span className={`font-medium ${meta[1]}`}>{meta[0]}</span>
}

function BackLink() {
  return (
    <Link
      to="/admin/events"
      className={`inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-ink mb-3 rounded transition-colors ${FOCUS_RING}`}
    >
      <Icon name="back" className="w-3.5 h-3.5" />
      행사 목록
    </Link>
  )
}

function EditSkeleton() {
  return (
    <div>
      <Skeleton className="h-4 w-20 mb-3" />
      <Skeleton className="h-6 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-4" />
      <Skeleton className="h-10 w-full mb-4" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <span className="sr-only" role="status">행사를 불러오는 중입니다</span>
    </div>
  )
}
