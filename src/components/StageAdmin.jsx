import { useState } from 'react'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { splitBoothName } from '../lib/boothKinds'
import { FOCUS_RING } from './ui/focusRing'

const input = 'bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY_STAGE = { name: '', booth_id: '', location: '' }
const EMPTY_SLOT = { stage_id: '', day: '', start_time: '', end_time: '', title: '', performer: '', note: '' }

// 무대·시간표 입력.
//
// 테이블과 API만 만들고 화면을 안 만들면 데이터를 넣을 방법이 SQL뿐이다. 호요랜드 무대는
// 마이그레이션으로 한 번 채워 넣었지만, 앞으로 들어올 행사는 관리자가 공지를 보고 직접
// 적어야 한다 — 그 자리가 여기다.
//
// 무대(장소)를 먼저 만들고 그 아래에 시간표를 넣는 두 단계다. 무대가 하나뿐인 행사가
// 대부분이라, 무대가 없으면 "메인 스테이지"를 한 번 만들고 시작하면 된다.
export default function StageAdmin({ eventId, stages, booths }) {
  const { toast, confirm } = useUIFeedback()
  const [open, setOpen] = useState(false)
  const [stageForm, setStageForm] = useState(EMPTY_STAGE)
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT)
  const [saving, setSaving] = useState(false)

  const setStage = f => e => setStageForm(p => ({ ...p, [f]: e.target.value }))
  const setSlot = f => e => setSlotForm(p => ({ ...p, [f]: e.target.value }))

  const addStage = async (e) => {
    e.preventDefault()
    if (!stageForm.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createStage(eventId, {
        name: stageForm.name.trim(),
        booth_id: stageForm.booth_id || null,
        location: stageForm.location.trim() || null,
        sort_order: stages.length,
      })
      setStageForm(EMPTY_STAGE)
    } catch (err) {
      toast(`무대 추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const removeStage = async (stage) => {
    if (!await confirm(`"${stage.name}" 무대를 삭제하시겠습니까? 그 무대의 시간표도 함께 지워집니다.`)) return
    try {
      await adminApi.deleteStage(stage.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const addSlot = async (e) => {
    e.preventDefault()
    if (!slotForm.stage_id || !slotForm.day || !slotForm.title.trim()) return
    setSaving(true)
    try {
      await adminApi.createStageSlot(eventId, {
        stage_id: slotForm.stage_id,
        day: slotForm.day,
        // 시간을 비워두면 "그날 진행은 확정, 시각만 발표 전"이 된다. 화면에서는
        // 시간표 맨 아래 "시간 미정"으로 모인다.
        start_time: slotForm.start_time || null,
        end_time: slotForm.end_time || null,
        title: slotForm.title.trim(),
        performer: slotForm.performer.trim() || null,
        note: slotForm.note.trim() || null,
      })
      setSlotForm({ ...EMPTY_SLOT, stage_id: slotForm.stage_id, day: slotForm.day })
    } catch (err) {
      toast(`프로그램 추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end mb-2">
        <button onClick={() => setOpen(true)} className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>
          + 무대 · 프로그램 추가
        </button>
      </div>
    )
  }

  return (
    <div className="border border-line rounded-xl p-3 mb-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">무대 · 프로그램 관리</p>
        <button onClick={() => setOpen(false)} className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>닫기</button>
      </div>

      <div>
        <p className="text-[11px] text-zinc-500 mb-1.5">무대(장소) — 부스를 고르면 그 부스의 무대가 됩니다</p>
        {stages.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {stages.map(s => (
              <li key={s.id} className="flex items-center gap-1.5 text-[11px] bg-surface-2 rounded-lg px-2 py-1">
                <span className="text-zinc-300">{s.name}</span>
                <button onClick={() => removeStage(s)} className={`text-danger/80 hover:text-danger rounded ${FOCUS_RING}`}>×</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addStage} className="flex flex-wrap items-center gap-1.5">
          <input value={stageForm.name} onChange={setStage('name')} placeholder="무대명 * (예: 메인 스테이지)" className={`${input} w-44`} required />
          <select value={stageForm.booth_id} onChange={setStage('booth_id')} className={input}>
            <option value="">행사 공용 무대</option>
            {booths.map(b => (
              <option key={b.id} value={b.id}>{splitBoothName(b.name).main} 부스 무대</option>
            ))}
          </select>
          <input value={stageForm.location} onChange={setStage('location')} placeholder="위치(1홀 중앙)" className={`${input} w-28`} />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">무대 추가</button>
        </form>
      </div>

      {stages.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[11px] text-zinc-500 mb-1.5">
            프로그램 — 같은 프로그램이 여러 날 열리면 날짜마다 한 줄씩 넣습니다
          </p>
          <form onSubmit={addSlot} className="flex flex-wrap items-center gap-1.5">
            <select value={slotForm.stage_id} onChange={setSlot('stage_id')} className={input} required>
              <option value="">무대 선택 *</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={slotForm.day} onChange={setSlot('day')} className={input} required />
            <input type="time" value={slotForm.start_time} onChange={setSlot('start_time')} className={input} />
            <input type="time" value={slotForm.end_time} onChange={setSlot('end_time')} className={input} />
            <input value={slotForm.title} onChange={setSlot('title')} placeholder="프로그램명 *" className={`${input} w-36`} required />
            <input value={slotForm.performer} onChange={setSlot('performer')} placeholder="출연자" className={`${input} w-24`} />
            <input value={slotForm.note} onChange={setSlot('note')} placeholder="설명" className={`${input} flex-1 min-w-[120px]`} />
            <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">프로그램 추가</button>
          </form>
          <p className="text-[11px] text-zinc-500 mt-1.5">시각을 비우면 “시간 미정”으로 표 맨 아래에 모입니다.</p>
        </div>
      )}
    </div>
  )
}
