import { useState } from 'react'
import { adminApi } from '../lib/adminApi'

const CATEGORIES = ['게임전시', '코스프레', '게임음악']

const EMPTY = {
  title: '', category: '게임전시', start_date: '', end_date: '',
  venue: '', venue_address: '', venue_lat: '', venue_lng: '',
  organizer: '', description: '', ticket_url: '', ticket_open_date: '',
  admission_fee: '', website: '', poster_url: '', trust_score: '3', tags: '',
}

function toForm(event) {
  if (!event) return EMPTY
  return {
    title: event.title ?? '',
    category: event.category ?? '게임전시',
    start_date: event.startDate ?? '',
    end_date: event.endDate ?? '',
    venue: event.venue ?? '',
    venue_address: event.venueAddress ?? '',
    venue_lat: event.venueLat ?? '',
    venue_lng: event.venueLng ?? '',
    organizer: event.organizer ?? '',
    description: event.description ?? '',
    ticket_url: event.ticketUrl ?? '',
    ticket_open_date: event.ticketOpenDate ?? '',
    admission_fee: event.admissionFee ?? '',
    website: event.website ?? '',
    poster_url: event.posterUrl ?? '',
    trust_score: String(event.trustScore ?? 3),
    tags: (event.tags ?? []).join(', '),
  }
}

function toPayload(form) {
  return {
    title: form.title || null,
    category: form.category,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    venue: form.venue || null,
    venue_address: form.venue_address || null,
    venue_lat: form.venue_lat !== '' ? Number(form.venue_lat) : null,
    venue_lng: form.venue_lng !== '' ? Number(form.venue_lng) : null,
    organizer: form.organizer || null,
    description: form.description || null,
    ticket_url: form.ticket_url || null,
    ticket_open_date: form.ticket_open_date || null,
    admission_fee: form.admission_fee || null,
    website: form.website || null,
    poster_url: form.poster_url || null,
    trust_score: form.trust_score !== '' ? Number(form.trust_score) : null,
    tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  }
}

const cls = 'w-full bg-white/5 border border-white/10 focus:border-indigo-500 rounded-xl px-3 py-2 text-white placeholder:text-zinc-600 focus:outline-none text-sm'

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

export default function AdminEventForm({ event, onClose, onSaved }) {
  const isEdit = !!event
  const [form, setForm] = useState(() => toForm(event))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title || !form.start_date || !form.end_date) {
      setError('제목, 시작일, 종료일은 필수입니다')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = toPayload(form)
      if (isEdit) {
        await adminApi.updateEvent(event.id, payload)
      } else {
        await adminApi.createEvent(payload)
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl mx-4 my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">{isEdit ? '행사 수정' : '행사 추가'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="제목 *">
            <input type="text" value={form.title} onChange={set('title')} className={cls} placeholder="행사명 입력" />
          </Field>

          <Field label="카테고리">
            <select value={form.category} onChange={set('category')} className={cls}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작일 *">
              <input type="date" value={form.start_date} onChange={set('start_date')} className={cls} />
            </Field>
            <Field label="종료일 *">
              <input type="date" value={form.end_date} onChange={set('end_date')} className={cls} />
            </Field>
          </div>

          <Field label="장소">
            <input type="text" value={form.venue} onChange={set('venue')} className={cls} placeholder="ex) BEXCO 제1전시장" />
          </Field>

          <Field label="주소">
            <input type="text" value={form.venue_address} onChange={set('venue_address')} className={cls} placeholder="ex) 부산광역시 해운대구 APEC로 55" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="위도">
              <input type="number" step="any" value={form.venue_lat} onChange={set('venue_lat')} className={cls} placeholder="ex) 35.1694" />
            </Field>
            <Field label="경도">
              <input type="number" step="any" value={form.venue_lng} onChange={set('venue_lng')} className={cls} placeholder="ex) 129.1284" />
            </Field>
          </div>

          <Field label="주최">
            <input type="text" value={form.organizer} onChange={set('organizer')} className={cls} />
          </Field>

          <Field label="설명">
            <textarea value={form.description} onChange={set('description')} rows={3} className={cls + ' resize-none'} placeholder="행사 소개 내용" />
          </Field>

          <Field label="입장료">
            <input type="text" value={form.admission_fee} onChange={set('admission_fee')} className={cls} placeholder="ex) 일반 15,000원 / 청소년 10,000원" />
          </Field>

          <Field label="예매 URL">
            <input type="url" value={form.ticket_url} onChange={set('ticket_url')} className={cls} placeholder="https://" />
          </Field>

          <Field label="예매 오픈일">
            <input type="date" value={form.ticket_open_date} onChange={set('ticket_open_date')} className={cls} />
          </Field>

          <Field label="공식 사이트">
            <input type="url" value={form.website} onChange={set('website')} className={cls} placeholder="https://" />
          </Field>

          <Field label="포스터 URL">
            <input type="url" value={form.poster_url} onChange={set('poster_url')} className={cls} placeholder="https://" />
          </Field>

          <Field label="신뢰도 (0~5)">
            <input type="number" min="0" max="5" value={form.trust_score} onChange={set('trust_score')} className={cls} />
          </Field>

          <Field label="태그 (쉼표 구분)">
            <input type="text" value={form.tags} onChange={set('tags')} className={cls} placeholder="ex) 게임전시, 부산, BEXCO" />
          </Field>

          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors mt-1"
          >
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '행사 추가'}
          </button>
        </form>
      </div>
    </div>
  )
}
