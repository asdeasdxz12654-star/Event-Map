import { useState } from 'react'
import { useEventBooths } from '../hooks/useEventBooths'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'

const EMPTY_FORM = { name: '', booth_no: '', goods: '' }

function BoothRow({ booth, isAdmin, onSaved }) {
  const { toast, confirm } = useUIFeedback()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: booth.name, booth_no: booth.boothNo ?? '', goods: booth.goods ?? '' })
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.updateBooth(booth.id, {
        name: form.name.trim(),
        booth_no: form.booth_no.trim() || null,
        goods: form.goods.trim() || null,
      })
      setEditing(false)
      onSaved?.()
    } catch (err) {
      toast(`수정 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!await confirm(`"${booth.name}" 부스를 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteBooth(booth.id)
      onSaved?.()
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-2 border-b border-white/5 last:border-0">
        <input value={form.name} onChange={set('name')} placeholder="업체명" className={cls + ' w-28'} />
        <input value={form.booth_no} onChange={set('booth_no')} placeholder="부스 번호" className={cls + ' w-20'} />
        <input value={form.goods} onChange={set('goods')} placeholder="제공/판매 굿즈" className={cls + ' flex-1 min-w-[140px]'} />
        <button onClick={save} disabled={saving} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-white">취소</button>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-white/5 last:border-0 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-white">{booth.name}</span>
          {booth.boothNo && (
            <span className="text-xs text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">{booth.boothNo}</span>
          )}
        </div>
        {booth.goods && <p className="text-xs text-zinc-400 mt-0.5">{booth.goods}</p>}
      </div>
      {isAdmin && (
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setEditing(true)} className="text-xs text-zinc-500 hover:text-white">수정</button>
          <button onClick={remove} className="text-xs text-red-400/70 hover:text-red-400">삭제</button>
        </div>
      )}
    </div>
  )
}

export default function BoothManager({ eventId, note }) {
  const { booths, loading } = useEventBooths(eventId)
  const { isAdmin } = useAdmin()
  const { toast } = useUIFeedback()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const addBooth = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createBooth(eventId, {
        name: form.name.trim(),
        booth_no: form.booth_no.trim() || null,
        goods: form.goods.trim() || null,
        sort_order: booths.length,
      })
      setForm(EMPTY_FORM)
    } catch (err) {
      toast(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!isAdmin && booths.length === 0 && !note)) return null

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-white">🏢 참가 업체 · 부스</h2>
        {isAdmin && (
          <button onClick={() => setShowAddForm(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
            {showAddForm ? '닫기' : '+ 부스 추가'}
          </button>
        )}
      </div>

      {booths.length === 0 && !showAddForm && (
        note ? (
          note === '미공개' ? (
            <p className="text-xs text-zinc-500">
              <span className="text-zinc-400">🚫 미공개</span> — 공식 행사에서 참가업체/부스 정보를 공개하지 않습니다.
            </p>
          ) : (
            <p className="text-xs text-zinc-500">ℹ️ {note}</p>
          )
        ) : (
          <p className="text-xs text-zinc-500">아직 등록된 참가 업체/부스 정보가 없습니다.</p>
        )
      )}

      {booths.map(booth => (
        <BoothRow key={booth.id} booth={booth} isAdmin={isAdmin} onSaved={() => {}} />
      ))}

      {isAdmin && showAddForm && (
        <form onSubmit={addBooth} className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-white/10">
          <input value={form.name} onChange={set('name')} placeholder="업체명 *" className={cls + ' w-28'} required />
          <input value={form.booth_no} onChange={set('booth_no')} placeholder="부스 번호" className={cls + ' w-20'} />
          <input value={form.goods} onChange={set('goods')} placeholder="제공/판매 굿즈" className={cls + ' flex-1 min-w-[140px]'} />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
            추가
          </button>
        </form>
      )}
    </div>
  )
}
