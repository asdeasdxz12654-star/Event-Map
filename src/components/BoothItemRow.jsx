import { useState } from 'react'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { BOOTH_KINDS, formatPrice } from '../lib/boothKinds'
import BoothThumb from './BoothThumb'
import ImageField from './ImageField'
import { ADMIN_INPUT as input } from './ui/formStyles'
import { useFormFields } from '../hooks/useFormFields'


// 부스 항목 한 줄. 읽기 상태에서는 썸네일 · 이름 · 설명 · 가격만 보이고,
// 가격은 오른쪽 끝에 tabular-nums로 붙어 세로줄이 맞는다 — 같은 부스 안에서
// "얼마짜리가 뭐였는지"를 위아래로 훑을 수 있게 하려는 정렬이다.
export default function BoothItemRow({ item, isAdmin, hueFrom }) {
  const { toast, confirm } = useUIFeedback()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, set, setForm] = useFormFields({
    kind: item.kind,
    name: item.name,
    price: item.price == null ? '' : String(item.price),
    price_note: item.priceNote ?? '',
    note: item.note ?? '',
    image_url: item.imageUrl ?? '',
    title: item.title ?? '',
    status: item.status ?? '',
  })


  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.updateBoothItem(item.id, {
        kind: form.kind,
        name: form.name.trim(),
        // 빈 칸은 "가격 없음"이지 0원이 아니다 — 빈 문자열을 Number()에 그대로 넘기면 0이 된다.
        price: form.price.trim() === '' ? null : Number(form.price),
        price_note: form.price_note.trim() || null,
        note: form.note.trim() || null,
        image_url: form.image_url.trim() || null,
        // 타이틀(IP)과 현장 상태는 굿즈 탭이 쓰는 값이다. 추가 폼에만 있고 수정 폼에
        // 없으면 이미 들어가 있는 수십 건에는 영영 채워 넣을 수 없다.
        title: form.title.trim() || null,
        status: form.status || null,
      })
      setEditing(false)
    } catch (err) {
      toast(`수정 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!await confirm(`"${item.name}" 항목을 삭제하시겠습니까?`)) return
    try {
      await adminApi.deleteBoothItem(item.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-2">
        <select value={form.kind} onChange={set('kind')} className={input}>
          {BOOTH_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input value={form.name} onChange={set('name')} placeholder="항목명 *" className={`${input} w-32`} />
        <input value={form.price} onChange={set('price')} placeholder="가격" inputMode="numeric" className={`${input} w-20`} />
        <input value={form.price_note} onChange={set('price_note')} placeholder="회당" className={`${input} w-16`} />
        <input value={form.title} onChange={set('title')} placeholder="타이틀(게임명)" className={`${input} w-28`} />
        <select value={form.status} onChange={set('status')} className={input}>
          <option value="">현장 상태 없음</option>
          <option value="soldout">품절</option>
          <option value="limited">수량 한정</option>
          <option value="preorder">예약 판매</option>
        </select>
        <input value={form.note} onChange={set('note')} placeholder="설명" className={`${input} flex-1 min-w-[120px]`} />
        <ImageField
          value={form.image_url}
          onChange={url => setForm(p => ({ ...p, image_url: url }))}
          prefix="items"
          kind="photo"
          className="flex-1 min-w-[180px]"
          inputClassName={`${input} flex-1 min-w-0`}
        />
        <button onClick={save} disabled={saving} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">저장</button>
        <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-ink">취소</button>
      </div>
    )
  }

  const price = formatPrice(item.price, item.priceNote)

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <BoothThumb name={item.name} src={item.imageUrl} size="sm" hueFrom={hueFrom} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink leading-snug">{item.name}</p>
        {item.note && <p className="text-xs text-zinc-400 leading-snug">{item.note}</p>}
      </div>
      {price ? (
        <span className="shrink-0 text-xs font-medium text-ink tabular-nums">{price}</span>
      ) : item.kind === 'free' ? (
        <span className="shrink-0 text-[10px] tracking-wide text-zinc-400 border border-line-strong rounded px-1.5 py-0.5">무료</span>
      ) : null}
      {isAdmin && (
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => setEditing(true)} className="text-xs text-zinc-400 hover:text-ink">수정</button>
          <button onClick={remove} className="text-xs text-red-400/70 hover:text-red-400">삭제</button>
        </div>
      )}
    </div>
  )
}
