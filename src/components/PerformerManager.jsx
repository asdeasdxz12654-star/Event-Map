import { useState } from 'react'
import { useEventPerformers } from '../hooks/useEventPerformers'
import { useAdmin } from '../contexts/AdminContext'
import { adminApi } from '../lib/adminApi'

const EMPTY_FORM = { artist_name: '', songs: '' }

function PerformerRow({ performer, isAdmin, onSaved }) {
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
      alert(`수정 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`"${performer.artistName}" 출연진을 삭제하시겠습니까?`)) return
    try {
      await adminApi.deletePerformer(performer.id)
      onSaved?.()
    } catch (err) {
      alert(`삭제 실패: ${err.message}`)
    }
  }

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  if (editing) {
    return (
      <div className="py-2 border-b border-white/5 last:border-0 space-y-1.5">
        <input value={form.artist_name} onChange={set('artist_name')} placeholder="가수/아티스트명" className={cls + ' w-full'} />
        <textarea
          value={form.songs}
          onChange={set('songs')}
          placeholder="세트리스트 (한 줄에 한 곡, 미공개면 비워두세요)"
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
          <p className="text-xs text-zinc-500 mt-1">세트리스트 미공개</p>
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

// 게임음악(콘서트/음악회) 카테고리 행사에서만 상세페이지에 노출 — 출연 가수와
// 세트리스트를 보여준다. 곡 목록이 미공개면 "세트리스트 미공개"로 표시.
export default function PerformerManager({ eventId }) {
  const { performers, loading } = useEventPerformers(eventId)
  const { isAdmin } = useAdmin()
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

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
      alert(`추가 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || (!isAdmin && performers.length === 0)) return null

  const cls = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500'

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-white">🎤 출연진 · 세트리스트</h2>
        {isAdmin && (
          <button onClick={() => setShowAddForm(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300">
            {showAddForm ? '닫기' : '+ 출연진 추가'}
          </button>
        )}
      </div>

      {performers.length === 0 && !showAddForm && (
        <p className="text-xs text-zinc-500">아직 등록된 출연진 정보가 없습니다.</p>
      )}

      {performers.map(performer => (
        <PerformerRow key={performer.id} performer={performer} isAdmin={isAdmin} onSaved={() => {}} />
      ))}

      {isAdmin && showAddForm && (
        <form onSubmit={addPerformer} className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
          <input value={form.artist_name} onChange={set('artist_name')} placeholder="가수/아티스트명 *" className={cls + ' w-full'} required />
          <textarea
            value={form.songs}
            onChange={set('songs')}
            placeholder="세트리스트 (한 줄에 한 곡, 미공개면 비워두세요)"
            rows={3}
            className={cls + ' w-full resize-none'}
          />
          <button type="submit" disabled={saving} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg">
            추가
          </button>
        </form>
      )}
    </div>
  )
}
