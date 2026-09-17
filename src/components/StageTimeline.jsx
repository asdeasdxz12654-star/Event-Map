import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Icon from './icons'
import Chip from './ui/Chip'
import Segmented from './ui/Segmented'
import DisclosureNote from './DisclosureNote'
import StageAdmin from './StageAdmin'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { FOCUS_RING } from './ui/focusRing'
import { boothHue, splitBoothName, slotKindLabel } from '../lib/boothKinds'
import { parseLocalDate } from '../data/events'

// "14:30:00" -> "14:30". DB의 time 값은 초까지 온다.
const hhmm = t => (t ? t.slice(0, 5) : null)

// 무대 시간표.
//
// 두 형태를 한 화면에서 다룬다 —
//   무대가 하나인 행사(호요랜드): 표 하나가 곧 행사 전체 일정이다. 무대 필터가 없다.
//   무대가 여럿인 행사(지스타형): 메인 스테이지와 기업 부스 무대가 동시에 돈다.
//                                무대 칩이 생기고, 각 줄에 무대 배지가 붙는다.
//
// 정렬은 useEventStages.sortSlots가 잡는다(날짜 → 시각 → sort_order).
export default function StageTimeline({ eventId, stages, slots, booths = [], cosplayers = [], note, onJump, error, onRetry }) {
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const days = useMemo(() => [...new Set(slots.map(s => s.day))].sort(), [slots])

  // 기본 날짜는 오늘(행사 기간 중이면), 아니면 첫날. 행사 당일에 열었을 때 어제 일정이
  // 먼저 보이면 매번 손으로 넘겨야 한다.
  const today = format(new Date(), 'yyyy-MM-dd')
  const [day, setDay] = useState(() => (days.includes(today) ? today : days[0] ?? null))
  const [stageId, setStageId] = useState(null)

  // 데이터가 늦게 도착하면(실시간 구독) days가 처음엔 비어 있다 — 그때 고른 값이 null로
  // 남아 표가 통째로 비어 보였다. 목록이 생기고 나서 한 번 맞춰준다.
  useEffect(() => {
    if (days.length > 0 && !days.includes(day)) {
      setDay(days.includes(today) ? today : days[0])
    }
  }, [days, day, today])

  // 1분마다 현재 시각을 다시 읽어 "지금" 표시를 옮긴다. 행사 당일에만 의미가 있다.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const stageById = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages])
  const boothById = useMemo(() => new Map(booths.map(b => [b.id, b])), [booths])

  // 시간이 정해진 코스어 등장도 같은 타임라인에 얹는다. 관람객에게는 무대 프로그램이든
  // 포토타임이든 똑같이 "몇 시에 어디서"다.
  const cosplaySlots = useMemo(() => (
    cosplayers
      .filter(c => c.day && c.startTime)
      .map(c => ({
        id: `cos-${c.id}`,
        stageId: null,
        boothId: c.boothId,
        day: c.day,
        startTime: c.startTime,
        endTime: c.endTime,
        title: `${c.name}${c.character ? ` — ${c.character}` : ''}`,
        // 배지가 이미 "주최 초청"·부스명으로 출처를 말한다. 여기에 "코스어 등장"을
        // 또 적으면 같은 말이 한 줄에 두 번 나온다.
        note: c.note ?? (c.title ? `${c.title} 코스프레` : null),
        isCosplay: true,
      }))
  ), [cosplayers])

  const all = useMemo(() => [...slots, ...cosplaySlots], [slots, cosplaySlots])

  // 고치는 중인 프로그램. 폼이 타임라인 위에 한 벌만 있으므로 여기서 들고 있는다.
  const [editingSlot, setEditingSlot] = useState(null)

  const removeSlot = async (slot) => {
    if (!await confirm(`"${slot.title}" 프로그램을 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteStageSlot(slot.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  // 아무것도 없을 때가 바로 채워 넣어야 할 때라, 빈 상태에서도 입력 자리는 남긴다.
  if (all.length === 0) {
    return (
      <div className="mb-4">
        {isAdmin && <StageAdmin eventId={eventId} stages={stages} booths={booths} />}
        <DisclosureNote note={note} subject="무대 프로그램" emptyText="아직 등록된 무대 일정이 없습니다." error={error} onRetry={onRetry} />
      </div>
    )
  }

  const showDays = days.length > 1
  const showStages = stages.length > 1

  const visible = all
    .filter(s => (showDays ? s.day === day : true))
    .filter(s => (stageId ? s.stageId === stageId : true))
    .sort((a, b) =>
      a.day.localeCompare(b.day)
      || (a.startTime ?? '~').localeCompare(b.startTime ?? '~')
      || a.title.localeCompare(b.title))

  // 시간 미정은 맨 아래로 모은다 — 시간표 중간에 끼면 그 아래 줄들까지 못 믿게 된다.
  const timed = visible.filter(s => s.startTime)
  const untimed = visible.filter(s => !s.startTime)

  const isToday = day === today
  const nowHm = format(now, 'HH:mm')
  // 지금 시각이 어느 줄 앞에 오는지. 오늘이 아니면 선을 그리지 않는다.
  const nowIndex = isToday ? timed.findIndex(s => hhmm(s.startTime) > nowHm) : -1

  const stageLabel = (slot) => {
    if (slot.isCosplay) {
      const booth = slot.boothId ? boothById.get(slot.boothId) : null
      return booth ? { name: splitBoothName(booth.name).main, booth } : { name: '주최 초청 코스어', booth: null }
    }
    const stage = stageById.get(slot.stageId)
    if (!stage) return null
    const booth = stage.boothId ? boothById.get(stage.boothId) : null
    return { name: stage.name, booth, location: stage.location }
  }

  return (
    <div className="flex flex-col gap-3 mb-4">
      {isAdmin && (
        <StageAdmin
          eventId={eventId}
          stages={stages}
          booths={booths}
          editingSlot={editingSlot}
          onDone={() => setEditingSlot(null)}
        />
      )}

      {showDays && (
        <Segmented
          ariaLabel="날짜"
          value={day}
          onChange={setDay}
          options={days.map(d => ({
            value: d,
            label: format(parseLocalDate(d), 'M.d eee', { locale: ko }),
          }))}
        />
      )}

      {showStages && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
          <Chip selected={stageId === null} onClick={() => setStageId(null)}>전체 무대</Chip>
          {stages.map(s => (
            <Chip
              key={s.id}
              selected={stageId === s.id}
              onClick={() => setStageId(stageId === s.id ? null : s.id)}
              dotColor={null}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: s.boothId ? `hsl(${boothHue(boothById.get(s.boothId)?.name ?? s.name)} 45% 55%)` : '#a5b4fc' }}
                aria-hidden="true"
              />
              {s.name}
            </Chip>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-400 tabular-nums" aria-live="polite">
        {visible.length}개 프로그램
        {showStages && stageId && ` · ${stageById.get(stageId)?.name ?? ''}`}
      </p>

      <div>
        {timed.map((slot, i) => (
          <div key={slot.id}>
            {i === nowIndex && <NowLine time={nowHm} />}
            <Slot
              slot={slot}
              stage={stageLabel(slot)}
              {...liveState(slot, isToday, nowHm)}
              showStage={showStages || !!slot.isCosplay}
              onJump={onJump}
              onEdit={isAdmin && !slot.isCosplay ? () => setEditingSlot(slot) : null}
              onRemove={isAdmin && !slot.isCosplay ? () => removeSlot(slot) : null}
            />
          </div>
        ))}
        {/* 오늘 일정이 전부 끝났으면 선이 맨 아래에 온다 */}
        {isToday && nowIndex === -1 && timed.length > 0 && <NowLine time={nowHm} />}
      </div>

      {untimed.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[11px] text-zinc-500 mb-1.5">시간 미정 — 진행은 확정, 시각만 발표 전</p>
          {untimed.map(slot => (
            <Slot
              key={slot.id}
              slot={slot}
              stage={stageLabel(slot)}
              showStage={showStages}
              onJump={onJump}
              onEdit={isAdmin && !slot.isCosplay ? () => setEditingSlot(slot) : null}
              onRemove={isAdmin && !slot.isCosplay ? () => removeSlot(slot) : null}
            />
          ))}
        </div>
      )}

      {note && <p className="text-xs text-zinc-500 leading-relaxed">{note}</p>}
    </div>
  )
}

// 진행 중과 지난 것은 함께 참일 수 없다.
//
// 예전엔 둘을 따로 계산했는데, 끝 시각이 없는 프로그램(시작만 공지된 경우)은
// "시작했으므로 지났다"와 "시작했고 안 끝났으므로 진행 중"이 동시에 참이 돼서
// 흐려진 채로 강조되는 줄이 나왔다. 진행 중을 먼저 정하고 나머지를 지난 것으로 본다.
function liveState(slot, isToday, nowHm) {
  if (!isToday) return { past: false, live: false }
  const start = hhmm(slot.startTime)
  const end = hhmm(slot.endTime)
  const live = start <= nowHm && (!end || end > nowHm)
  return { live, past: !live && (end ?? start) < nowHm }
}

function NowLine({ time }) {
  return (
    <div className="flex items-center gap-2 py-1.5" aria-hidden="true">
      <span className="h-px flex-1 bg-live/40" />
      <span className="text-[11px] text-live tabular-nums">지금 {time}</span>
      <span className="h-px flex-1 bg-live/40" />
    </div>
  )
}

function Slot({ slot, stage, past = false, live = false, showStage, onJump, onEdit, onRemove }) {
  const booth = stage?.booth
  return (
    <div className={`grid grid-cols-[58px_1fr] gap-3 py-3 border-b border-line last:border-0 ${past ? 'opacity-50' : ''} ${
      live ? 'bg-live/5 -mx-3 px-3 border-l-2 border-l-live' : ''
    }`}>
      <div className={`text-xs tabular-nums leading-snug ${live ? 'text-live' : 'text-zinc-300'}`}>
        {hhmm(slot.startTime) ?? '미정'}
        {slot.endTime && <span className="block text-zinc-500">{hhmm(slot.endTime)}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink leading-snug">
          {slot.title}
          {/* 종류는 제목 옆에 작게. 줄을 따로 쓰면 시간표가 두 배로 길어진다 —
              무대 탭은 한 화면에 몇 시에 뭐가 있는지를 훑는 자리다. */}
          {slotKindLabel(slot.kind) && (
            <span className="ml-1.5 align-middle text-[10px] font-medium text-zinc-400 bg-surface-2 px-1.5 py-0.5 rounded-md">
              {slotKindLabel(slot.kind)}
            </span>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className={`ml-2 align-middle text-[11px] font-normal text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}
            >
              수정
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className={`ml-2 align-middle text-[11px] font-normal text-danger/80 hover:text-danger rounded ${FOCUS_RING}`}
            >
              삭제
            </button>
          )}
        </p>
        {slot.performer && <p className="text-xs text-zinc-400 mt-0.5">출연 — {slot.performer}</p>}
        {slot.note && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{slot.note}</p>}
        {showStage && stage && (
          booth ? (
            <button
              type="button"
              onClick={() => onJump?.('booths', booth.id)}
              className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-zinc-300 bg-surface-2 px-2 py-1 rounded-md hover:text-ink transition-colors ${FOCUS_RING}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: `hsl(${boothHue(booth.name)} 45% 55%)` }}
                aria-hidden="true"
              />
              {stage.name}
              {booth.boothNo && <span className="text-zinc-500 tabular-nums">· {booth.boothNo}</span>}
              <Icon name="chevronRight" className="w-3 h-3 opacity-60" />
            </button>
          ) : (
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-zinc-400 bg-surface-2 px-2 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
              {stage.name}
              {stage.location && <span className="text-zinc-500">· {stage.location}</span>}
            </span>
          )
        )}
      </div>
    </div>
  )
}
