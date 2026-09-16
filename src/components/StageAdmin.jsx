import { useState } from 'react'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { splitBoothName, SLOT_KINDS } from '../lib/boothKinds'
import { FOCUS_RING } from './ui/focusRing'
import { ADMIN_INPUT as input } from './ui/formStyles'
import { useFormFields } from '../hooks/useFormFields'

const EMPTY_STAGE = { name: '', booth_id: '', location: '' }
const EMPTY_SLOT = { stage_id: '', day: '', start_time: '', end_time: '', title: '', kind: '', performer: '', note: '' }

// 입력칸은 null을 못 다룬다(value={null}이면 비제어 입력이 된다). 전부 문자열로 맞춘다.
function stageToForm(s) {
  return { name: s.name ?? '', booth_id: s.boothId ?? '', location: s.location ?? '' }
}

function slotToForm(s) {
  return {
    stage_id: s.stageId ?? '',
    day: s.day ?? '',
    start_time: s.startTime?.slice(0, 5) ?? '',
    end_time: s.endTime?.slice(0, 5) ?? '',
    title: s.title ?? '',
    kind: s.kind ?? '',
    performer: s.performer ?? '',
    note: s.note ?? '',
  }
}

// 무대·시간표 입력.
//
// 테이블과 API만 만들고 화면을 안 만들면 데이터를 넣을 방법이 SQL뿐이다. 호요랜드 무대는
// 마이그레이션으로 한 번 채워 넣었지만, 앞으로 들어올 행사는 관리자가 공지를 보고 직접
// 적어야 한다 — 그 자리가 여기다.
//
// 무대(장소)를 먼저 만들고 그 아래에 시간표를 넣는 두 단계다. 무대가 하나뿐인 행사가
// 대부분이라, 무대가 없으면 "메인 스테이지"를 한 번 만들고 시작하면 된다.
//
// 추가만 되고 수정이 안 됐다
//   updateStage·updateStageSlot은 adminApi에 있었는데 부르는 곳이 없었다. 그래서 프로그램
//   시각이 한 시간 밀리면 지우고 다시 넣어야 했고, 그 사이 그 줄이 화면에서 사라진다.
//   시간표는 행사 당일에 가장 자주 바뀌는 데이터라 이게 특히 아팠다.
//   입력칸이 똑같으므로 폼을 나누지 않고 editing 유무로 동작만 가른다.
export default function StageAdmin({ eventId, stages, booths, editingSlot = null, onDone }) {
  const { toast, confirm } = useUIFeedback()
  const [open, setOpen] = useState(false)
  const [stageForm, setStage, setStageForm] = useFormFields(EMPTY_STAGE)
  const [slotForm, setSlot, setSlotForm] = useFormFields(EMPTY_SLOT)
  const [editingStage, setEditingStage] = useState(null)
  const [saving, setSaving] = useState(false)

  // 바깥(타임라인)에서 "이 프로그램을 고치자"고 하면 폼을 열고 값을 채운다.
  // 이펙트가 아니라 렌더 중에 맞춘다 — 이펙트면 빈 폼이 한 프레임 비쳤다 채워진다.
  const [lastSlot, setLastSlot] = useState(editingSlot)
  if (editingSlot !== lastSlot) {
    setLastSlot(editingSlot)
    if (editingSlot) {
      setSlotForm(slotToForm(editingSlot))
      setOpen(true)
    }
  }

  const cancelSlot = () => {
    setSlotForm(EMPTY_SLOT)
    onDone?.()
  }

  const submitStage = async (e) => {
    e.preventDefault()
    if (!stageForm.name.trim()) return
    setSaving(true)
    const payload = {
      name: stageForm.name.trim(),
      booth_id: stageForm.booth_id || null,
      location: stageForm.location.trim() || null,
    }
    try {
      if (editingStage) {
        await adminApi.updateStage(editingStage.id, payload)
        setEditingStage(null)
      } else {
        await adminApi.createStage(eventId, { ...payload, sort_order: stages.length })
      }
      setStageForm(EMPTY_STAGE)
    } catch (err) {
      toast(`무대 ${editingStage ? '수정' : '추가'} 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const removeStage = async (stage) => {
    if (!await confirm(`"${stage.name}" 무대를 삭제하시겠습니까? 그 무대의 시간표도 함께 지워집니다.`)) return
    try {
      await adminApi.deleteStage(stage.id)
      if (editingStage?.id === stage.id) { setEditingStage(null); setStageForm(EMPTY_STAGE) }
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const submitSlot = async (e) => {
    e.preventDefault()
    if (!slotForm.stage_id || !slotForm.day || !slotForm.title.trim()) return
    setSaving(true)
    const payload = {
      stage_id: slotForm.stage_id,
      day: slotForm.day,
      // 시간을 비워두면 "그날 진행은 확정, 시각만 발표 전"이 된다. 화면에서는
      // 시간표 맨 아래 "시간 미정"으로 모인다.
      start_time: slotForm.start_time || null,
      end_time: slotForm.end_time || null,
      title: slotForm.title.trim(),
      // 비우면 종류 없음. DB check가 null을 허용한다.
      kind: slotForm.kind || null,
      performer: slotForm.performer.trim() || null,
      note: slotForm.note.trim() || null,
    }
    try {
      if (editingSlot) {
        await adminApi.updateStageSlot(editingSlot.id, payload)
        cancelSlot()
      } else {
        await adminApi.createStageSlot(eventId, payload)
        // 다음 프로그램도 같은 무대·같은 날인 경우가 대부분이라 그 둘만 남긴다.
        setSlotForm({ ...EMPTY_SLOT, stage_id: slotForm.stage_id, day: slotForm.day })
      }
    } catch (err) {
      toast(`프로그램 ${editingSlot ? '수정' : '추가'} 실패: ${err.message}`)
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
        <button onClick={() => { setOpen(false); cancelSlot() }} className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>닫기</button>
      </div>

      <div>
        <p className="text-[11px] text-zinc-500 mb-1.5">무대(장소) — 부스를 고르면 그 부스의 무대가 됩니다</p>
        {stages.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {stages.map(s => (
              <li key={s.id} className={`flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1 ${
                editingStage?.id === s.id ? 'bg-indigo-600/25 ring-1 ring-indigo-500/50' : 'bg-surface-2'
              }`}>
                <button
                  type="button"
                  onClick={() => { setEditingStage(s); setStageForm(stageToForm(s)) }}
                  title="이름·위치 수정"
                  className={`text-zinc-300 hover:text-ink rounded ${FOCUS_RING}`}
                >
                  {s.name}
                </button>
                <button onClick={() => removeStage(s)} aria-label={`${s.name} 삭제`} className={`text-danger/80 hover:text-danger rounded ${FOCUS_RING}`}>×</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submitStage} className="flex flex-wrap items-center gap-1.5">
          <input value={stageForm.name} onChange={setStage('name')} placeholder="무대명 * (예: 메인 스테이지)" className={`${input} w-44`} required />
          <select value={stageForm.booth_id} onChange={setStage('booth_id')} className={input}>
            <option value="">행사 공용 무대</option>
            {booths.map(b => (
              <option key={b.id} value={b.id}>{splitBoothName(b.name).main} 부스 무대</option>
            ))}
          </select>
          <input value={stageForm.location} onChange={setStage('location')} placeholder="위치(1홀 중앙)" className={`${input} w-28`} />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
            {editingStage ? '무대 수정' : '무대 추가'}
          </button>
          {editingStage && (
            <button
              type="button"
              onClick={() => { setEditingStage(null); setStageForm(EMPTY_STAGE) }}
              className={`text-xs text-zinc-400 hover:text-ink px-1 rounded ${FOCUS_RING}`}
            >
              취소
            </button>
          )}
        </form>
      </div>

      {stages.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[11px] text-zinc-500 mb-1.5">
            {editingSlot
              ? `프로그램 수정 — ${editingSlot.title}`
              : '프로그램 — 같은 프로그램이 여러 날 열리면 날짜마다 한 줄씩 넣습니다'}
          </p>
          <form onSubmit={submitSlot} className="flex flex-wrap items-center gap-1.5">
            <select value={slotForm.stage_id} onChange={setSlot('stage_id')} className={input} required>
              <option value="">무대 선택 *</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={slotForm.day} onChange={setSlot('day')} className={input} required />
            <input type="time" value={slotForm.start_time} onChange={setSlot('start_time')} className={input} />
            <input type="time" value={slotForm.end_time} onChange={setSlot('end_time')} className={input} />
            <input value={slotForm.title} onChange={setSlot('title')} placeholder="프로그램명 *" className={`${input} w-36`} required />
            <select value={slotForm.kind} onChange={setSlot('kind')} className={input} aria-label="프로그램 종류">
              <option value="">종류 없음</option>
              {SLOT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <input value={slotForm.performer} onChange={setSlot('performer')} placeholder="출연자" className={`${input} w-24`} />
            <input value={slotForm.note} onChange={setSlot('note')} placeholder="설명" className={`${input} flex-1 min-w-[120px]`} />
            <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
              {saving ? '저장 중...' : editingSlot ? '수정 완료' : '프로그램 추가'}
            </button>
            {editingSlot && (
              <button type="button" onClick={cancelSlot} className={`text-xs text-zinc-400 hover:text-ink px-1 rounded ${FOCUS_RING}`}>취소</button>
            )}
          </form>
          <p className="text-[11px] text-zinc-500 mt-1.5">시각을 비우면 “시간 미정”으로 표 맨 아래에 모입니다.</p>
        </div>
      )}
    </div>
  )
}
