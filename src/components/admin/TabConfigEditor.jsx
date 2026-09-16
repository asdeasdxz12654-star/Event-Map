import { useState } from 'react'
import Icon from '../icons'
import { adminApi } from '../../lib/adminApi'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'
import { FOCUS_RING } from '../ui/focusRing'
import { ADMIN_INPUT as input } from '../ui/formStyles'
import { useFormFields } from '../../hooks/useFormFields'

// 상세페이지 탭 구성.
//
// 기본 탭 네 개는 코드가 만든다 — 이 화면은 그 위에 "예외"만 적는다. 행이 없으면
// 지금까지와 똑같이 동작하므로, 손대지 않은 행사는 아무것도 달라지지 않는다.
//
// 순서를 드래그가 아니라 ↑↓ 버튼으로 두는 이유
//   탭은 많아야 예닐곱 개다. 드래그는 손가락으로 집는 화면에서 실수가 잦고
//   (특히 목록이 스크롤되는 중이면), 접근성을 맞추려면 키보드 조작을 따로 만들어야 한다.
//   버튼 두 개면 마우스·터치·키보드가 전부 같은 길로 간다.
const BUILTIN = [
  { key: 'booths', name: '부스' },
  { key: 'stage', name: '무대 · 출연진' },
  { key: 'goods', name: '굿즈' },
  { key: 'cosplay', name: '코스프레' },
]

const EMPTY_CUSTOM = { key: '', label: '', body: '' }

export default function TabConfigEditor({ eventId, config }) {
  const { toast, confirm } = useUIFeedback()
  const [busy, setBusy] = useState(false)
  const [form, set, setForm] = useFormFields(EMPTY_CUSTOM)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const rowOf = key => config.find(t => t.key === key)

  // 지금 화면에 보이는 순서. 설정이 없는 기본 탭은 코드 순서(BUILTIN 배열)를 따른다.
  const ordered = [
    ...BUILTIN.map((b, i) => {
      const row = rowOf(b.key)
      return { ...b, builtin: true, row, sortOrder: row?.sortOrder ?? i, visible: row?.visible ?? true }
    }),
    ...config.filter(t => !t.builtin).map(t => ({
      key: t.key, name: t.label ?? t.key, builtin: false, row: t, sortOrder: t.sortOrder, visible: t.visible,
    })),
  ].sort((a, b) => a.sortOrder - b.sortOrder)

  // 설정 행을 만들거나 고친다. 기본 탭은 처음 손댈 때 행이 없으므로 그때 만든다.
  const upsert = async (item, patch) => {
    setBusy(true)
    try {
      if (item.row) {
        await adminApi.updateTab(item.row.id, patch)
      } else {
        await adminApi.createTab(eventId, {
          key: item.key,
          builtin: true,
          label: null,
          visible: true,
          sort_order: item.sortOrder,
          ...patch,
        })
      }
    } catch (err) {
      toast(`저장 실패: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  // 위아래로 한 칸. 두 항목의 sort_order를 맞바꾸는 대신 현재 순서를 전부 다시 매긴다 —
  // 설정 행이 없는 탭이 섞여 있어서 맞바꾸기만 하면 값이 어긋난다.
  const move = async (index, dir) => {
    const next = index + dir
    if (next < 0 || next >= ordered.length) return
    const reordered = [...ordered]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(next, 0, moved)
    setBusy(true)
    try {
      for (const [i, item] of reordered.entries()) {
        if (item.sortOrder === i) continue
        if (item.row) await adminApi.updateTab(item.row.id, { sort_order: i })
        else await adminApi.createTab(eventId, { key: item.key, builtin: true, visible: true, sort_order: i })
      }
    } catch (err) {
      toast(`순서 변경 실패: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const removeCustom = async (item) => {
    if (!await confirm(`"${item.name}" 탭을 삭제하시겠습니까? 본문도 함께 지워집니다.`)) return
    try {
      await adminApi.deleteTab(item.row.id)
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  // 기본 탭의 설정 행을 지우면 "손대지 않은 상태"로 돌아간다.
  const reset = async (item) => {
    if (!item.row) return
    try {
      await adminApi.deleteTab(item.row.id)
    } catch (err) {
      toast(`되돌리기 실패: ${err.message}`)
    }
  }

  const submitCustom = async (e) => {
    e.preventDefault()
    const key = form.key.trim() || slugify(form.label)
    if (!form.label.trim() || !key) return
    setBusy(true)
    const payload = {
      key,
      builtin: false,
      label: form.label.trim(),
      body: form.body.trim() || null,
      visible: true,
    }
    try {
      if (editingId) {
        await adminApi.updateTab(editingId, payload)
      } else {
        await adminApi.createTab(eventId, { ...payload, sort_order: ordered.length })
      }
      setForm(EMPTY_CUSTOM)
      setAdding(false)
      setEditingId(null)
    } catch (err) {
      toast(`${editingId ? '수정' : '추가'} 실패: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        기본 탭은 내용이 있을 때만 나타납니다. 여기서는 그 위에 <b className="text-zinc-400">예외</b>만 적습니다 —
        손대지 않은 탭은 지금까지와 똑같이 동작합니다.
      </p>

      <ul className="flex flex-col gap-1.5">
        {ordered.map((item, i) => (
          <li
            key={item.key}
            className={`flex flex-wrap items-center gap-x-2 gap-y-2 bg-surface-1 border border-line rounded-xl px-3 py-2.5 ${
              item.visible ? '' : 'opacity-60'
            }`}
          >
            <span className="flex shrink-0 flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0}
                aria-label={`${item.name} 위로`} className={`text-zinc-500 hover:text-ink disabled:opacity-25 rounded ${FOCUS_RING}`}>
                <Icon name="chevronDown" className="w-3.5 h-3.5 rotate-180" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={busy || i === ordered.length - 1}
                aria-label={`${item.name} 아래로`} className={`text-zinc-500 hover:text-ink disabled:opacity-25 rounded ${FOCUS_RING}`}>
                <Icon name="chevronDown" className="w-3.5 h-3.5" />
              </button>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink truncate">
                {item.row?.label?.trim() || item.name}
                {!item.builtin && <span className="ml-1.5 text-[10px] text-indigo-400">직접 만든 탭</span>}
              </span>
              <span className="block text-[11px] text-zinc-600 font-mono truncate">{item.key}</span>
            </span>

            {item.builtin && (
              <input
                defaultValue={item.row?.label ?? ''}
                onBlur={e => {
                  const v = e.target.value.trim()
                  if (v === (item.row?.label ?? '')) return
                  upsert(item, { label: v || null })
                }}
                placeholder="이름 바꾸기"
                aria-label={`${item.name} 탭 이름`}
                className={`${input} w-28`}
              />
            )}

            <button
              type="button"
              onClick={() => upsert(item, { visible: !item.visible })}
              disabled={busy}
              className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${FOCUS_RING} ${
                item.visible ? 'bg-surface-2 text-zinc-300 hover:text-ink' : 'bg-warn/15 text-warn'
              }`}
            >
              {item.visible ? '보임' : '숨김'}
            </button>

            {item.builtin
              ? item.row && (
                <button type="button" onClick={() => reset(item)}
                  className={`shrink-0 text-xs text-zinc-500 hover:text-ink px-1 rounded ${FOCUS_RING}`}>
                  기본값
                </button>
              )
              : (
                <>
                  <button type="button"
                    onClick={() => { setForm({ key: item.row.key, label: item.row.label ?? '', body: item.row.body ?? '' }); setEditingId(item.row.id); setAdding(true) }}
                    className={`shrink-0 text-xs text-zinc-400 hover:text-ink px-1 rounded ${FOCUS_RING}`}>
                    수정
                  </button>
                  <button type="button" onClick={() => removeCustom(item)}
                    className={`shrink-0 text-xs text-danger/80 hover:text-danger px-1 rounded ${FOCUS_RING}`}>
                    삭제
                  </button>
                </>
              )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={submitCustom} className="border border-line rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink">{editingId ? '탭 수정' : '탭 추가'}</p>
            <button type="button" onClick={() => { setAdding(false); setEditingId(null); setForm(EMPTY_CUSTOM) }}
              className={`text-xs text-zinc-400 hover:text-ink rounded ${FOCUS_RING}`}>닫기</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={form.label} onChange={set('label')} placeholder="탭 이름 * (예: 교통 안내)" className={`${input} w-40`} required />
            <input value={form.key} onChange={set('key')} placeholder="주소용 이름 (비우면 자동)" className={`${input} w-40`} disabled={!!editingId} />
          </div>
          <textarea
            value={form.body}
            onChange={set('body')}
            rows={5}
            placeholder={'본문. 빈 줄로 문단을 나눕니다.\nhttp로 시작하는 주소는 자동으로 링크가 됩니다.'}
            className={`${input} w-full leading-relaxed`}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="text-xs px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
              {busy ? '저장 중...' : editingId ? '수정 완료' : '탭 추가'}
            </button>
            <p className="text-[11px] text-zinc-500">서식은 문단과 링크만 됩니다 — 표나 이미지는 부스·굿즈 탭에 넣으세요.</p>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={() => setAdding(true)}
            className={`text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}>
            + 탭 추가
          </button>
        </div>
      )}
    </div>
  )
}

// 주소에 쓸 이름. 한글은 그대로 두면 주소가 길어지므로 영숫자만 남기고, 남는 게 없으면
// 시각으로 만든다 — 어차피 화면에 안 보이는 값이고, 유일하기만 하면 된다.
function slugify(label) {
  const ascii = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return ascii || `tab-${Date.now().toString(36)}`
}
