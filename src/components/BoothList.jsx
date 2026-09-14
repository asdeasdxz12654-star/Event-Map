import { useState } from 'react'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { boothHue, splitBoothName } from '../lib/boothKinds'
import BoothCard from './BoothCard'
import DisclosureNote from './DisclosureNote'

const input = 'bg-ink/5 border border-ink/10 rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY_BOOTH = { name: '', booth_no: '', image_url: '' }

// 부스가 이 개수를 넘으면 카드를 전부 쌓지 않고 칩으로 하나씩 고르게 한다.
// 호요랜드는 부스가 8개고 항목이 50개가 넘어서, 전부 펼치면 스크롤이 화면 열 배가 된다.
// 반대로 두세 개뿐인 행사에서 칩을 붙이면 누르기 전까지 내용을 감추는 손해만 남는다.
const CHIP_THRESHOLD = 3

export default function BoothList({ eventId, booths, items, note }) {
  const { isAdmin } = useAdmin()
  const { toast } = useUIFeedback()
  const [selectedId, setSelectedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_BOOTH)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const itemsOf = (boothId) => items.filter(item => item.boothId === boothId)

  // 굿즈만 들어 있는 부스(공식 굿즈 판매존 등)는 여기 말고 "굿즈" 탭에서 보여준다 —
  // 같은 내용을 두 탭에 중복으로 싣지 않기 위해서다. 굿즈와 체험이 섞인 부스는
  // 여기 남되 굿즈 항목만 빠진다(BoothCard의 hideKinds).
  const visibleBooths = booths.filter(booth => {
    const own = itemsOf(booth.id)
    return own.length === 0 || own.some(item => item.kind !== 'goods')
  })

  const addBooth = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createBooth(eventId, {
        name: form.name.trim(),
        booth_no: form.booth_no.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: booths.length,
      })
      setForm(EMPTY_BOOTH)
      setShowAdd(false)
    } catch (err) {
      toast(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const useChips = visibleBooths.length > CHIP_THRESHOLD
  const selected = visibleBooths.find(b => b.id === selectedId) ?? visibleBooths[0]
  const shown = useChips ? (selected ? [selected] : []) : visibleBooths

  return (
    <div className="flex flex-col gap-3 mb-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
            {showAdd ? '닫기' : '+ 부스 추가'}
          </button>
        </div>
      )}

      {isAdmin && showAdd && (
        <form onSubmit={addBooth} className="flex flex-wrap items-center gap-1.5 p-3 border border-ink/10 rounded-xl">
          <input value={form.name} onChange={set('name')} placeholder="부스명 *" className={`${input} w-36`} required />
          <input value={form.booth_no} onChange={set('booth_no')} placeholder="부스 번호" className={`${input} w-20`} />
          <input value={form.image_url} onChange={set('image_url')} placeholder="대표 이미지 URL" className={`${input} flex-1 min-w-[140px]`} />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">추가</button>
        </form>
      )}

      {visibleBooths.length === 0 ? (
        <DisclosureNote
          note={note}
          subject="참가업체/부스"
          emptyText="아직 등록된 참가 업체/부스 정보가 없습니다."
        />
      ) : (
        <>
          {useChips && (
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
              {visibleBooths.map(booth => {
                const on = booth.id === selected?.id
                const hue = boothHue(booth.name)
                return (
                  <button
                    key={booth.id}
                    onClick={() => setSelectedId(booth.id)}
                    aria-pressed={on}
                    className={`shrink-0 flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-xs transition-colors ${
                      on ? 'text-ink font-semibold' : 'border-ink/10 text-zinc-400 hover:text-ink'
                    }`}
                    style={on ? {
                      borderColor: `hsl(${hue} 45% 45%)`,
                      backgroundColor: `hsl(${hue} 45% 45% / 0.14)`,
                    } : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className="w-3.5 h-3.5 rounded shrink-0"
                      style={{ background: `hsl(${hue} 45% 45%)` }}
                    />
                    {splitBoothName(booth.name).main}
                  </button>
                )
              })}
            </div>
          )}

          {shown.map(booth => (
            <BoothCard
              key={booth.id}
              eventId={eventId}
              booth={booth}
              items={itemsOf(booth.id)}
              hideKinds={['goods']}
            />
          ))}

          {note && <p className="text-xs text-zinc-500 leading-relaxed">{note}</p>}
        </>
      )}
    </div>
  )
}
