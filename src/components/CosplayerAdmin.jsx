import { useState } from 'react'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { splitBoothName } from '../lib/boothKinds'
import { FOCUS_RING } from './ui/focusRing'
import ImageField from './ImageField'

const input = 'bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY = {
  name: '', booth_id: '', character: '', title: '',
  photo_url: '', sns_url: '', day: '', start_time: '', end_time: '', note: '',
}

// 코스어 입력.
//
// 부스를 비워두면 주최 초청이 된다 — 화면의 세그먼트가 그 값으로 갈린다.
// 사진은 공식 공지에 실린 것만 넣는다. 현장에서 찍힌 사진을 임의로 모아 넣지 않는다.
export default function CosplayerAdmin({ eventId, booths, count }) {
  const { toast } = useUIFeedback()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  const add = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createCosplayer(eventId, {
        name: form.name.trim(),
        booth_id: form.booth_id || null,
        character: form.character.trim() || null,
        title: form.title.trim() || null,
        photo_url: form.photo_url.trim() || null,
        sns_url: form.sns_url.trim() || null,
        // 날짜를 비우면 "행사 기간 내내 상주"로 본다.
        day: form.day || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        note: form.note.trim() || null,
        sort_order: count,
      })
      setForm({ ...EMPTY, booth_id: form.booth_id, day: form.day })
    } catch (err) {
      toast(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end mb-2">
        <button onClick={() => setOpen(true)} className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>
          + 코스어 추가
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={add} className="border border-line rounded-xl p-3 mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">코스어 추가</p>
        <button type="button" onClick={() => setOpen(false)} className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>닫기</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input value={form.name} onChange={set('name')} placeholder="활동명 *" className={`${input} w-28`} required />
        <select value={form.booth_id} onChange={set('booth_id')} className={input}>
          <option value="">주최 초청</option>
          {booths.map(b => (
            <option key={b.id} value={b.id}>{splitBoothName(b.name).main} 초청</option>
          ))}
        </select>
        <input value={form.character} onChange={set('character')} placeholder="캐릭터" className={`${input} w-24`} />
        <input value={form.title} onChange={set('title')} placeholder="원작" className={`${input} w-24`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" value={form.day} onChange={set('day')} className={input} />
        <input type="time" value={form.start_time} onChange={set('start_time')} className={input} />
        <input type="time" value={form.end_time} onChange={set('end_time')} className={input} />
        <ImageField
          value={form.photo_url}
          onChange={url => setForm(p => ({ ...p, photo_url: url }))}
          prefix="cosplayers"
          kind="photo"
          placeholder="사진 (공식 공지에 실린 것만)"
          className="flex-1 min-w-[220px]"
          inputClassName={`${input} flex-1 min-w-0`}
        />
        <input value={form.sns_url} onChange={set('sns_url')} placeholder="SNS URL" className={`${input} w-32`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input value={form.note} onChange={set('note')} placeholder="설명 (포토타임 장소 등)" className={`${input} flex-1 min-w-[160px]`} />
        <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">추가</button>
      </div>

      <p className="text-[11px] text-zinc-500">
        날짜를 비우면 “전일 상주”, 시각을 채우면 무대 타임라인에도 함께 나타납니다.
      </p>
    </form>
  )
}
