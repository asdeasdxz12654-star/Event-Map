import { useState } from 'react'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import { BOOTH_KINDS, groupByKind, splitBoothName, operatorLabel, priceRangeLabel } from '../lib/boothKinds'
import BoothThumb from './BoothThumb'
import BoothItemRow from './BoothItemRow'

const input = 'bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'
const EMPTY_ITEM = { kind: 'paid', name: '', price: '', price_note: '', note: '', image_url: '', title: '', status: '' }

// 부스 하나.
//
// 예전에는 굿즈를 숨겼다 — 굿즈만 있는 부스는 목록에서 통째로 빠지고, 굿즈와 체험이
// 섞인 부스는 굿즈 항목만 빠졌다(hideKinds). 같은 내용을 굿즈 탭과 두 번 싣지 않으려는
// 처리였는데, 그 결과 "이 부스에 굿즈가 있나?"에 부스 탭이 답을 못 했다.
// 중복 회피가 은폐가 된 셈이다.
//
// 지금은 숨기지 않는다. 다만 다른 탭이 주인인 것(굿즈·무대·코스어)은 개수와 범위만
// 요약해 보여주고 그 탭으로 보낸다. 부스 탭이 직접 펼치는 건 체험 항목뿐이다 —
// "어디에 가면 뭘 할 수 있나"가 이 탭이 답하는 질문이기 때문이다.
export default function BoothCard({ eventId, booth, items, stageCount = 0, cosplayerCount = 0, onJump }) {
  const { isAdmin } = useAdmin()
  const { toast, confirm } = useUIFeedback()
  const [expanded, setExpanded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)
  const [editingBooth, setEditingBooth] = useState(false)
  const [boothForm, setBoothForm] = useState({
    name: booth.name,
    booth_no: booth.boothNo ?? '',
    image_url: booth.imageUrl ?? '',
    goods: booth.goods ?? '',
    operator: booth.operator ?? 'company',
    hall: booth.hall ?? '',
    genre: booth.genre ?? '',
  })

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  const setBooth = (field) => (e) => setBoothForm(prev => ({ ...prev, [field]: e.target.value }))

  const goods = items.filter(item => item.kind === 'goods')
  const experiences = items.filter(item => item.kind !== 'goods')
  const groups = groupByKind(experiences)
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
        title: form.title.trim() || null,
        status: form.status || null,
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
        operator: boothForm.operator,
        hall: boothForm.hall.trim() || null,
        genre: boothForm.genre.trim() || null,
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

  const experienceSummary = groups.map(g => `${g.label} ${g.items.length}`).join(' · ')
  const goodsRange = priceRangeLabel(goods)

  return (
    <div className="border border-line rounded-2xl overflow-hidden bg-surface-1">
      <div className="flex items-center gap-3 p-3">
        <BoothThumb name={booth.name} src={booth.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink leading-snug truncate">{main}</p>
          <p className="text-xs text-zinc-500 leading-snug truncate">
            {[operatorLabel(booth.operator), booth.hall, booth.genre, sub].filter(Boolean).join(' · ')}
          </p>
        </div>
        {booth.boothNo && (
          <span className="shrink-0 text-xs text-zinc-300 bg-surface-2 px-2 py-0.5 rounded tabular-nums">{booth.boothNo}</span>
        )}
        {isAdmin && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setEditingBooth(v => !v)} className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>수정</button>
            <button onClick={removeBooth} className={`text-xs text-danger/80 hover:text-danger rounded ${FOCUS_RING}`}>삭제</button>
          </div>
        )}
      </div>

      {isAdmin && editingBooth && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-line">
          <input value={boothForm.name} onChange={setBooth('name')} placeholder="부스명 *" className={`${input} w-36`} />
          <input value={boothForm.booth_no} onChange={setBooth('booth_no')} placeholder="부스 번호" className={`${input} w-20`} />
          <select value={boothForm.operator} onChange={setBooth('operator')} className={input}>
            <option value="company">기업</option>
            <option value="creator">창작자</option>
            <option value="host">주최 운영</option>
          </select>
          <input value={boothForm.hall} onChange={setBooth('hall')} placeholder="구역(1홀)" className={`${input} w-24`} />
          <input value={boothForm.genre} onChange={setBooth('genre')} placeholder="장르" className={`${input} w-24`} />
          <input value={boothForm.image_url} onChange={setBooth('image_url')} placeholder="대표 이미지 URL" className={`${input} flex-1 min-w-[140px]`} />
          <input value={boothForm.goods} onChange={setBooth('goods')} placeholder="옛 자유 텍스트(항목이 없을 때만 표시)" className={`${input} flex-1 min-w-[140px]`} />
          <button onClick={saveBooth} className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>저장</button>
          <button onClick={() => setEditingBooth(false)} className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>취소</button>
        </div>
      )}

      {/* ── 요약 줄 ──────────────────────────────────────────────────────────
          값이 없는 줄은 아예 없다. 체험만 이 카드 안에서 펼쳐지고, 나머지는 점프한다. */}
      <div className="border-t border-line divide-y divide-line">
        {experiences.length > 0 && (
          <SummaryRow
            label="체험"
            value={experienceSummary}
            action={expanded ? '접기' : '펼치기'}
            onClick={() => setExpanded(v => !v)}
            expanded={expanded}
          />
        )}
        {goods.length > 0 && (
          <SummaryRow
            label="굿즈"
            value={`${goods.length}종${goodsRange ? ` · ${goodsRange}` : ''}`}
            action="굿즈 탭"
            onClick={() => onJump?.('goods', booth.id)}
          />
        )}
        {stageCount > 0 && (
          <SummaryRow
            label="무대"
            value={`부스 무대 ${stageCount}회`}
            action="무대 탭"
            onClick={() => onJump?.('stage', booth.id)}
          />
        )}
        {cosplayerCount > 0 && (
          <SummaryRow
            label="코스어"
            value={`${cosplayerCount}명 초청`}
            action="코스프레 탭"
            onClick={() => onJump?.('cosplay', booth.id)}
          />
        )}

        {/* 항목이 하나도 없는 부스. 옛 자유 텍스트(goods)가 있으면 그대로 살린다 —
            줄바꿈이 들어 있는 경우가 많아 형태를 건드리지 않는다. */}
        {items.length === 0 && (
          booth.goods
            ? <p className="px-3 py-2.5 text-xs text-zinc-400 whitespace-pre-line leading-relaxed">{booth.goods}</p>
            : <p className="px-3 py-3 text-xs text-zinc-500">세부 내용이 아직 공개되지 않았습니다.</p>
        )}
      </div>

      {expanded && groups.length > 0 && (
        <div className="border-t border-line">
          {groups.map(group => (
            <div key={group.kind} className="px-3 py-2.5 border-b border-line last:border-0">
              <p className="text-[11px] font-medium tracking-wider text-zinc-500 mb-1.5">{group.label}</p>
              <div className="divide-y divide-line">
                {group.items.map(item => (
                  <BoothItemRow key={item.id} item={item} isAdmin={isAdmin} hueFrom={booth.name} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="px-3 py-2 border-t border-line">
          {showAdd ? (
            <form onSubmit={addItem} className="flex flex-wrap items-center gap-1.5">
              <select value={form.kind} onChange={set('kind')} className={input}>
                {BOOTH_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <input value={form.name} onChange={set('name')} placeholder="항목명 *" className={`${input} w-32`} required />
              <input value={form.title} onChange={set('title')} placeholder="타이틀(게임명)" className={`${input} w-28`} />
              <select value={form.status} onChange={set('status')} className={input}>
                <option value="">상태 없음</option>
                <option value="soldout">품절</option>
                <option value="limited">수량 한정</option>
                <option value="preorder">예약 판매</option>
              </select>
              <input value={form.price} onChange={set('price')} placeholder="가격" inputMode="numeric" className={`${input} w-20`} />
              <input value={form.price_note} onChange={set('price_note')} placeholder="회당" className={`${input} w-16`} />
              <input value={form.note} onChange={set('note')} placeholder="설명" className={`${input} flex-1 min-w-[120px]`} />
              <input value={form.image_url} onChange={set('image_url')} placeholder="이미지 URL" className={`${input} flex-1 min-w-[120px]`} />
              <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">추가</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-zinc-400 hover:text-ink">닫기</button>
            </form>
          ) : (
            <button onClick={() => setShowAdd(true)} className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>+ 항목 추가</button>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, value, action, onClick, expanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors ${FOCUS_RING}`}
    >
      <span className="shrink-0 w-12 text-[11px] text-zinc-500">{label}</span>
      <span className="flex-1 min-w-0 text-xs text-zinc-300 truncate tabular-nums">{value}</span>
      <span className="shrink-0 flex items-center gap-1 text-[11px] text-indigo-400">
        {action}
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className="w-3 h-3" />
      </span>
    </button>
  )
}
