import { useState } from 'react'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import BoothCard from './BoothCard'
import BoothFilters, { filterBooths } from './BoothFilters'
import BoothDenseList from './BoothDenseList'
import DisclosureNote from './DisclosureNote'
import ImageField from './ImageField'
import { FOCUS_RING } from './ui/focusRing'

const input = 'bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY_BOOTH = { name: '', booth_no: '', image_url: '', operator: 'company', hall: '', genre: '' }

// 부스가 이 수를 넘으면 카드를 쌓지 않고 한 줄짜리 밀집 목록으로 바꾼다.
//
// 예전에는 3개를 넘으면 칩으로 하나씩 골라야만 내용을 볼 수 있었다. 그건 부스가
// 8개일 때(호요랜드)의 해법이었고, 굿즈·무대를 요약 줄로 접어 카드가 짧아진 지금은
// 수십 개까지 그냥 쌓아도 읽힌다. 그 위(코믹월드의 수백~수천 개)에서는 카드 자체가
// 성립하지 않으므로 표현을 바꾼다 — 그 규모의 질문은 "내가 찾는 곳이 몇 번인가"뿐이다.
const DENSE_THRESHOLD = 40

export default function BoothList({
  eventId, booths, items, note,
  stages = [], slots = [], cosplayers = [],
  onJump,
}) {
  const { isAdmin } = useAdmin()
  const { toast } = useUIFeedback()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_BOOTH)
  const [saving, setSaving] = useState(false)
  const [operator, setOperator] = useState(null)
  const [hall, setHall] = useState(null)
  const [search, setSearch] = useState('')

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const itemsOf = (boothId) => items.filter(item => item.boothId === boothId)
  // 이 부스에 딸린 무대가 몇 번 도는지. 무대(장소)는 부스에 붙고 슬롯은 무대에 붙으므로
  // 두 단계를 건너야 한다.
  const stageCountOf = (boothId) => {
    const ids = stages.filter(s => s.boothId === boothId).map(s => s.id)
    return ids.length === 0 ? 0 : slots.filter(s => ids.includes(s.stageId)).length
  }
  const cosplayerCountOf = (boothId) => cosplayers.filter(c => c.boothId === boothId).length

  const addBooth = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await adminApi.createBooth(eventId, {
        name: form.name.trim(),
        booth_no: form.booth_no.trim() || null,
        image_url: form.image_url.trim() || null,
        operator: form.operator,
        hall: form.hall.trim() || null,
        genre: form.genre.trim() || null,
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

  const filtered = filterBooths(booths, { operator, hall, search })
  const dense = filtered.length > DENSE_THRESHOLD

  return (
    <div className="flex flex-col gap-3 mb-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(v => !v)} className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>
            {showAdd ? '닫기' : '+ 부스 추가'}
          </button>
        </div>
      )}

      {isAdmin && showAdd && (
        <form onSubmit={addBooth} className="flex flex-wrap items-center gap-1.5 p-3 border border-line rounded-xl">
          <input value={form.name} onChange={set('name')} placeholder="부스명 *" className={`${input} w-36`} required />
          <input value={form.booth_no} onChange={set('booth_no')} placeholder="부스 번호" className={`${input} w-20`} />
          <select value={form.operator} onChange={set('operator')} className={input}>
            <option value="company">기업</option>
            <option value="creator">창작자</option>
            <option value="host">주최 운영</option>
          </select>
          <input value={form.hall} onChange={set('hall')} placeholder="구역(1홀)" className={`${input} w-24`} />
          <input value={form.genre} onChange={set('genre')} placeholder="장르" className={`${input} w-24`} />
          <ImageField
            value={form.image_url}
            onChange={url => setForm(p => ({ ...p, image_url: url }))}
            prefix="booths"
            kind="thumb"
            placeholder="대표 이미지 URL"
            className="flex-1 min-w-[200px]"
            inputClassName={`${input} flex-1 min-w-0`}
          />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">추가</button>
        </form>
      )}

      {booths.length === 0 ? (
        <DisclosureNote
          note={note}
          subject="참가업체/부스"
          emptyText="아직 등록된 참가 업체/부스 정보가 없습니다."
        />
      ) : (
        <>
          <BoothFilters
            booths={booths}
            operator={operator}
            onOperatorChange={op => { setOperator(op); setHall(null) }}
            hall={hall}
            onHallChange={setHall}
            search={search}
            onSearchChange={setSearch}
          />

          {filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 py-6 text-center">
              {search ? `"${search}"에 해당하는 부스가 없습니다` : '해당하는 부스가 없습니다'}
            </p>
          ) : dense ? (
            <>
              <p className="text-xs text-zinc-400 tabular-nums" aria-live="polite">{filtered.length}곳</p>
              {/* 밀집 목록에서 한 줄을 누르면 검색창에 그 이름을 넣어 카드로 좁힌다 —
                  수천 곳 중 하나를 고른 뒤 자세히 보려면 결국 카드가 필요하다. */}
              <BoothDenseList booths={filtered} onSelect={booth => setSearch(booth.name)} />
            </>
          ) : (
            <>
              {filtered.length !== booths.length && (
                <p className="text-xs text-zinc-400 tabular-nums" aria-live="polite">{filtered.length}곳</p>
              )}
              <div className="flex flex-col gap-3">
                {filtered.map(booth => (
                  <BoothCard
                    key={booth.id}
                    eventId={eventId}
                    booth={booth}
                    items={itemsOf(booth.id)}
                    stageCount={stageCountOf(booth.id)}
                    cosplayerCount={cosplayerCountOf(booth.id)}
                    onJump={onJump}
                  />
                ))}
              </div>
            </>
          )}

          {note && <p className="text-xs text-zinc-500 leading-relaxed">{note}</p>}
        </>
      )}
    </div>
  )
}
