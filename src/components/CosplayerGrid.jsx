import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Icon from './icons'
import Chip from './ui/Chip'
import Segmented from './ui/Segmented'
import DisclosureNote from './DisclosureNote'
import CosplayerAdmin from './CosplayerAdmin'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { FOCUS_RING } from './ui/focusRing'
import { boothHue, splitBoothName } from '../lib/boothKinds'
import { parseLocalDate } from '../data/events'

const hhmm = t => (t ? t.slice(0, 5) : null)

// 코스프레 탭.
//
// 코스어는 두 갈래로 온다 — 주최가 초청한 사람과, 참가 부스가 자기 부스로 부른 사람.
// 관람객에게는 "누가 오나"가 한 질문이지만 "어디 가면 만나나"는 답이 다르므로
// 세그먼트로 가른다.
//
// 사진은 공식 공지에 실린 것만 쓴다. 없으면 색 타일 + 이름으로 두고, 현장 사진을
// 임의로 모아 넣지 않는다 — 초상권은 우리가 판단할 문제가 아니다.
export default function CosplayerGrid({ eventId, cosplayers, booths, note, focusBoothId, onJump }) {
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const boothById = useMemo(() => new Map(booths.map(b => [b.id, b])), [booths])
  const [origin, setOrigin] = useState(focusBoothId ? 'booth' : null)
  const [boothId, setBoothId] = useState(focusBoothId ?? null)
  const [day, setDay] = useState(null)

  useEffect(() => {
    setBoothId(focusBoothId ?? null)
    if (focusBoothId) setOrigin('booth')
  }, [focusBoothId])

  const days = useMemo(
    () => [...new Set(cosplayers.map(c => c.day).filter(Boolean))].sort(),
    [cosplayers]
  )

  const remove = async (c) => {
    if (!await confirm(`"${c.name}" 코스어를 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteCosplayer(c.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  if (cosplayers.length === 0) {
    return (
      <div className="mb-4">
        {isAdmin && <CosplayerAdmin eventId={eventId} booths={booths} count={0} />}
        <DisclosureNote note={note} subject="코스어 라인업" emptyText="아직 등록된 코스어 정보가 없습니다." />
      </div>
    )
  }

  const hostCount = cosplayers.filter(c => !c.boothId).length
  const boothCount = cosplayers.length - hostCount
  const showOrigin = hostCount > 0 && boothCount > 0

  const filtered = cosplayers.filter(c => {
    if (origin === 'host' && c.boothId) return false
    if (origin === 'booth' && !c.boothId) return false
    if (boothId && c.boothId !== boothId) return false
    if (day && c.day !== day) return false
    return true
  })

  // 시간이 정해진 사람만 하단 타임라인에 오른다. 날짜만 있는 사람은 "그날 상주"다.
  const scheduled = filtered
    .filter(c => c.startTime)
    .sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.startTime.localeCompare(b.startTime))

  return (
    <div className="flex flex-col gap-3 mb-4">
      {isAdmin && <CosplayerAdmin eventId={eventId} booths={booths} count={cosplayers.length} />}

      {showOrigin && (
        <Segmented
          className="sm:max-w-md"
          ariaLabel="코스어 초청 주체"
          value={origin}
          onChange={o => { setOrigin(o); setBoothId(null) }}
          options={[
            { value: null, label: '전체', count: cosplayers.length },
            { value: 'host', label: '주최 초청', count: hostCount },
            { value: 'booth', label: '부스 초청', count: boothCount },
          ]}
        />
      )}

      {days.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
          <Chip selected={day === null} onClick={() => setDay(null)}>전체</Chip>
          {days.map(d => (
            <Chip key={d} selected={day === d} onClick={() => setDay(day === d ? null : d)}>
              {format(parseLocalDate(d), 'M.d eee', { locale: ko })}
            </Chip>
          ))}
        </div>
      )}

      {boothId && (
        <div className="flex items-center gap-1.5">
          <Chip removable onClick={() => setBoothId(null)}>
            {splitBoothName(boothById.get(boothId)?.name ?? '').main || '선택한 부스'}
          </Chip>
        </div>
      )}

      <p className="text-xs text-zinc-400 tabular-nums" aria-live="polite">{filtered.length}명</p>

      {filtered.length === 0 ? (
        <p className="text-xs text-zinc-400 py-8 text-center">해당하는 코스어가 없습니다</p>
      ) : (
        <ul className="grid grid-cols-3 lg:grid-cols-5 gap-3">
          {filtered.map(c => (
            <li key={c.id}>
              <Card
                cosplayer={c}
                booth={c.boothId ? boothById.get(c.boothId) : null}
                onJump={onJump}
                onRemove={isAdmin ? () => remove(c) : null}
              />
            </li>
          ))}
        </ul>
      )}

      {scheduled.length > 0 && (
        <div className="border-t border-line pt-3 mt-1">
          <p className="text-sm font-semibold text-ink mb-2">등장 일정</p>
          {scheduled.map(c => {
            const booth = c.boothId ? boothById.get(c.boothId) : null
            return (
              <div key={c.id} className="grid grid-cols-[58px_1fr] gap-3 py-2.5 border-b border-line last:border-0">
                <div className="text-xs text-zinc-300 tabular-nums leading-snug">
                  {hhmm(c.startTime)}
                  {c.endTime && <span className="block text-zinc-500">{hhmm(c.endTime)}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ink leading-snug">
                    {c.name}
                    {c.character && <span className="text-zinc-400"> — {c.character}</span>}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {[
                      c.day && format(parseLocalDate(c.day), 'M.d eee', { locale: ko }),
                      booth ? `${splitBoothName(booth.name).main}${booth.boothNo ? ` · ${booth.boothNo}` : ''}` : '주최 초청',
                      c.note,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {note && <p className="text-xs text-zinc-500 leading-relaxed">{note}</p>}
    </div>
  )
}

function Card({ cosplayer: c, booth, onJump, onRemove }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hue = boothHue(c.name)
  const showImage = !!c.photoUrl && !imgFailed

  return (
    <div className="min-w-0">
      <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-line mb-1.5">
        {showImage ? (
          <img
            src={c.photoUrl}
            alt={`${c.name} 코스프레`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-full h-full grid place-items-center text-lg font-bold text-white/90"
            style={{ background: `linear-gradient(150deg, hsl(${hue} 45% 44%), hsl(${(hue + 40) % 360} 42% 28%))` }}
          >
            {[...c.name][0] ?? '?'}
          </div>
        )}
        <span className="absolute left-1.5 bottom-1.5 max-w-[calc(100%-12px)] px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] text-white truncate">
          {booth ? splitBoothName(booth.name).main : '주최 초청'}
        </span>
      </div>

      <p className="text-xs font-semibold text-ink truncate">{c.name}</p>
      <p className="text-[11px] text-zinc-500 truncate">
        {[c.character, c.title].filter(Boolean).join(' · ') || ' '}
      </p>

      <div className="flex items-center gap-1.5 mt-1">
        {c.snsUrl && (
          <a
            href={c.snsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${c.name} SNS 열기`}
            className={`text-zinc-400 hover:text-ink transition-colors rounded ${FOCUS_RING}`}
          >
            <Icon name="external" className="w-3.5 h-3.5" />
          </a>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${c.name} 삭제`}
            className={`ml-auto text-[11px] text-danger/80 hover:text-danger rounded ${FOCUS_RING}`}
          >
            삭제
          </button>
        )}
        {booth && (
          <button
            type="button"
            onClick={() => onJump?.('booths', booth.id)}
            aria-label={`${splitBoothName(booth.name).main} 부스로 이동`}
            className={`text-zinc-400 hover:text-ink transition-colors rounded ${FOCUS_RING}`}
          >
            <Icon name="pin" className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
