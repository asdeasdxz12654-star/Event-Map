import { useState } from 'react'
import { useEventPerformers } from '../hooks/useEventPerformers'
import { useAdmin } from '../contexts/AdminContext'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'
import SectionCard from './SectionCard'
import DisclosureNote from './DisclosureNote'

const EMPTY_FORM = { artist_name: '', songs: '' }

// 게임음악(콘서트/음악회) 카테고리는 "가수 + 세트리스트"로, 그 외 카테고리는
// "무대 프로그램(공연·토크쇼·경연 등) + 진행 내용"으로 문구만 다르게 보여준다 —
// 데이터 구조(artist_name/songs)는 동일하게 재사용.
function copyFor(category) {
  const isConcert = category === '게임음악'
  return {
    heading: isConcert ? '🎤 출연진 · 세트리스트' : '🎤 무대 일정 · 프로그램',
    addLabel: isConcert ? '+ 출연진 추가' : '+ 무대 프로그램 추가',
    namePlaceholder: isConcert ? '가수/아티스트명' : '프로그램명 (예: 코스프레 경연대회)',
    detailPlaceholder: isConcert
      ? '세트리스트 (한 줄에 한 곡, 미공개면 비워두세요)'
      : '진행 시간·내용 (예: "16:30 코스프레 무대공연", 미공개면 비워두세요)',
    undisclosed: isConcert ? '세트리스트 미공개' : '상세 내용 미공개',
    emptyText: isConcert ? '아직 등록된 출연진 정보가 없습니다.' : '아직 등록된 무대 프로그램 정보가 없습니다.',
  }
}

function PerformerRow({ performer, copy, isAdmin, onSaved }) {
  const { toast, confirm } = useUIFeedback()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ artist_name: performer.artistName, songs: performer.songs ?? '' })
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const save = async () => {
    if (!form.artist_name.trim()) return
    setSaving(true)
    try {
      await adminApi.updatePerformer(performer.id, {
        artist_name: form.artist_name.trim(),
        songs: form.songs.trim() || null,
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
    if (!await confirm(`"${performer.artistName}" 항목을 삭제하시겠습니까?`)) return
    try {
      await adminApi.deletePerformer(performer.id)
      onSaved?.()
    } catch (err) {
      toast(`삭제 실패: ${err.message}`)
    }
  }

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  if (editing) {
    return (
      <div className="py-2 border-b border-white/5 last:border-0 space-y-1.5">
        <input value={form.artist_name} onChange={set('artist_name')} placeholder={copy.namePlaceholder} className={cls + ' w-full'} />
        <textarea
          value={form.songs}
          onChange={set('songs')}
          placeholder={copy.detailPlaceholder}
          rows={3}
          className={cls + ' w-full resize-none'}
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">저장</button>
          <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-white">취소</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-white/5 last:border-0 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-white">{performer.artistName}</span>
        {performer.songs ? (
          <ul className="text-xs text-zinc-400 mt-1 space-y-0.5 list-disc list-inside">
            {performer.songs.split('\n').map(s => s.trim()).filter(Boolean).map((song, i) => (
              <li key={i}>{song}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500 mt-1">{copy.undisclosed}</p>
        )}
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

// 콘서트뿐 아니라 모든 카테고리에서 노출 — 콘서트는 "출연진·세트리스트",
// 그 외는 "무대 일정·프로그램"으로 문구만 바뀐다. note는 목록이 비어있을 때
// 대신 보여줄 공개 상태 메모(events.stage_info_note) — booth_info_note와 같은 방식.
export default function PerformerManager({ eventId, category, note }) {
  const { performers, loading } = useEventPerformers(eventId)
  const { isAdmin } = useAdmin()
  const { toast } = useUIFeedback()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const copy = copyFor(category)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const addPerformer = async (e) => {
    e.preventDefault()
    if (!form.artist_name.trim()) return
    setSaving(true)
    try {
      await adminApi.createPerformer(eventId, {
        artist_name: form.artist_name.trim(),
        songs: form.songs.trim() || null,
        sort_order: performers.length,
      })
      setForm(EMPTY_FORM)
    } catch (err) {
      toast(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!isAdmin && performers.length === 0 && !note)) return null

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  return (
    <SectionCard
      title={copy.heading}
      action={isAdmin && (
        <button onClick={() => setShowAddForm(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
          {showAddForm ? '닫기' : copy.addLabel}
        </button>
      )}
    >
      {performers.length === 0 && !showAddForm && (
        <DisclosureNote note={note} subject="무대 프로그램" emptyText={copy.emptyText} />
      )}

      {performers.map(performer => (
        <PerformerRow key={performer.id} performer={performer} copy={copy} isAdmin={isAdmin} onSaved={() => {}} />
      ))}

      {isAdmin && showAddForm && (
        <form onSubmit={addPerformer} className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
          <input value={form.artist_name} onChange={set('artist_name')} placeholder={`${copy.namePlaceholder} *`} className={cls + ' w-full'} required />
          <textarea
            value={form.songs}
            onChange={set('songs')}
            placeholder={copy.detailPlaceholder}
            rows={3}
            className={cls + ' w-full resize-none'}
          />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
            추가
          </button>
        </form>
      )}
    </SectionCard>
  )
}
