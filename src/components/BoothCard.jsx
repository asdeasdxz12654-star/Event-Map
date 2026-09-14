import { useState } from 'react'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { BOOTH_KINDS, groupByKind, splitBoothName } from '../lib/boothKinds'
import BoothThumb from './BoothThumb'
import BoothItemRow from './BoothItemRow'

const input = 'bg-ink/5 border border-ink/10 rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY_ITEM = { kind: 'paid', name: '', price: '', price_note: '', note: '', image_url: '' }

// 부스 하나. 항목(event_booth_items)이 있으면 종류별로 묶어서 보여주고,
// 없으면 예전 자유 텍스트(goods)를 그대로 보여준다 — 옛 데이터와 "관리자가 급히 한 줄
// 적어둔" 경우를 위해 두 방식을 다 지원한다.
export default function BoothCard({ eventId, booth, items, hideKinds = [] }) {
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)
  const [editingBooth, setEditingBooth] = useState(false)
  const [boothForm, setBoothForm] = useState({
    name: booth.name,
    booth_no: booth.boothNo ?? '',
    image_url: booth.imageUrl ?? '',
    goods: booth.goods ?? '',
  })

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  const setBooth = (field) => (e) => setBoothForm(prev => ({ ...prev, [field]: e.target.value }))

  const visible = items.filter(item => !hideKinds.includes(item.kind))
  const groups = groupByKind(visible)
  const { main, sub } = splitBoothName(booth.name)

  const addItem = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createBoothItem(eventId, {
        booth_id: booth.id,
        kind: form.kind,
        name: form.name.trim(),
        price: form.price.trim() === '' ? null : Number(form.price),
        price_note: form.price_note.trim() || null,
        note: form.note.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: items.length + 1,
      })
      setForm(EMPTY_ITEM)
    } catch (err) {
      toast(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const saveBooth = async () => {
    if (!boothForm.name.trim()) return
    try {
      await adminApi.updateBooth(booth.id, {
        name: boothForm.name.trim(),
        booth_no: boothForm.booth_no.trim() || null,
        image_url: boothForm.image_url.trim() || null,
        goods: boothForm.goods.trim() || null,
      })
      setEditingBooth(false)
    } catch (err) {
      toast(`수정 실패: ${err.message}`)
    }
  }

  const removeBooth = async () => {
    if (!await confirm(`"${booth.name}" 부스를 삭제하시겠습니까? 안에 있는 항목도 함께 지워집니다.`)) return
    try {
      await adminApi.deleteBooth(booth.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  return (
    <div className="border border-ink/10 rounded-2xl overflow-hidden bg-ink/[0.03]">
      <div className="flex items-center gap-3 p-3 border-b border-ink/10">
        <BoothThumb name={booth.name} src={booth.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink leading-snug truncate">{main}</p>
          {sub && <p className="text-xs text-zinc-400 leading-snug truncate">{sub}</p>}
        </div>
        {booth.boothNo && (
          <span className="shrink-0 text-xs text-zinc-400 bg-ink/5 px-1.5 py-0.5 rounded">{booth.boothNo}</span>
        )}
        {isAdmin && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setEditingBooth(v => !v)} className="text-xs text-zinc-400 hover:text-ink">수정</button>
            <button onClick={removeBooth} className="text-xs text-red-400/70 hover:text-red-400">삭제</button>
          </div>
        )}
      </div>

      {isAdmin && editingBooth && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-ink/10">
          <input value={boothForm.name} onChange={setBooth('name')} placeholder="부스명 *" className={`${input} w-36`} />
          <input value={boothForm.booth_no} onChange={setBooth('booth_no')} placeholder="부스 번호" className={`${input} w-20`} />
          <input value={boothForm.image_url} onChange={setBooth('image_url')} placeholder="대표 이미지 URL" className={`${input} flex-1 min-w-[140px]`} />
          <input value={boothForm.goods} onChange={setBooth('goods')} placeholder="옛 자유 텍스트(항목이 없을 때만 표시)" className={`${input} flex-1 min-w-[140px]`} />
          <button onClick={saveBooth} className="text-xs text-indigo-400 hover:text-indigo-300">저장</button>
          <button onClick={() => setEditingBooth(false)} className="text-xs text-zinc-400 hover:text-ink">취소</button>
        </div>
      )}

      {groups.length > 0 ? (
        groups.map(group => (
          <div key={group.kind} className="px-3 py-2.5 border-b border-ink/5 last:border-0">
            <p className="text-[10px] font-medium tracking-wider uppercase text-zinc-500 mb-1.5">{group.label}</p>
            <div className="divide-y divide-ink/5">
              {group.items.map(item => (
                <BoothItemRow key={item.id} item={item} isAdmin={isAdmin} hueFrom={booth.name} />
              ))}
            </div>
          </div>
        ))
      ) : booth.goods ? (
        // 항목으로 쪼개기 전의 옛 데이터. 줄바꿈이 들어 있는 경우가 많아 그대로 살린다.
        <p className="px-3 py-2.5 text-xs text-zinc-400 whitespace-pre-line leading-relaxed">{booth.goods}</p>
      ) : (
        <p className="px-3 py-3 text-xs text-zinc-500">세부 내용이 아직 공개되지 않았습니다.</p>
      )}

      {isAdmin && (
        <div className="px-3 py-2 border-t border-ink/10">
          {showAdd ? (
            <form onSubmit={addItem} className="flex flex-wrap items-center gap-1.5">
              <select value={form.kind} onChange={set('kind')} className={input}>
                {BOOTH_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <input value={form.name} onChange={set('name')} placeholder="항목명 *" className={`${input} w-32`} required />
              <input value={form.price} onChange={set('price')} placeholder="가격" inputMode="numeric" className={`${input} w-20`} />
              <input value={form.price_note} onChange={set('price_note')} placeholder="회당" className={`${input} w-16`} />
              <input value={form.note} onChange={set('note')} placeholder="설명" className={`${input} flex-1 min-w-[120px]`} />
              <input value={form.image_url} onChange={set('image_url')} placeholder="이미지 URL" className={`${input} flex-1 min-w-[120px]`} />
              <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">추가</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-zinc-400 hover:text-ink">닫기</button>
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} className="text-xs text-indigo-400 hover:text-indigo-300">+ 항목 추가</button>
          )}
        </div>
      )}
    </div>
  )
}
