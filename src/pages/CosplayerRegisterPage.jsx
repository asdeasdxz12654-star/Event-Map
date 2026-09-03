import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useMyProfile, saveProfile, deleteProfile } from '../hooks/useCosplayers'
import { useEvents } from '../hooks/useEvents'
import { getEventStatus } from '../data/events'

const BLANK = { nickname: '', bio: '', profile_url: '', twitter_url: '', instagram_url: '', other_url: '' }

function isHttpsUrl(val) {
  if (!val) return true
  try { return new URL(val).protocol === 'https:' } catch { return false }
}

function validateForm(form) {
  if (!form.nickname.trim()) return '닉네임을 입력해 주세요.'
  if (form.nickname.trim().length > 30) return '닉네임은 30자 이내로 입력해 주세요.'
  if (form.bio.length > 200) return '소개는 200자 이내로 입력해 주세요.'
  for (const key of ['profile_url', 'twitter_url', 'instagram_url', 'other_url']) {
    if (form[key] && !isHttpsUrl(form[key])) return 'URL은 https:// 로 시작해야 합니다.'
  }
  return null
}

export default function CosplayerRegisterPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const { profile, refresh } = useMyProfile(user?.id)
  const { events } = useEvents()

  const [form, setForm] = useState(BLANK)
  const [selectedEventIds, setSelectedEventIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // 기존 프로필 불러오기
  useEffect(() => {
    if (!profile) return
    setForm({
      nickname:      profile.nickname      ?? '',
      bio:           profile.bio           ?? '',
      profile_url:   profile.profile_url   ?? '',
      twitter_url:   profile.twitter_url   ?? '',
      instagram_url: profile.instagram_url ?? '',
      other_url:     profile.other_url     ?? '',
    })
    setSelectedEventIds((profile.cosplayer_events ?? []).map(ce => ce.event_id))
  }, [profile])

  const upcomingEvents = events.filter(e => {
    const s = getEventStatus(e)
    return s === 'upcoming' || s === 'ongoing'
  })

  const toggleEvent = id =>
    setSelectedEventIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleSubmit = async e => {
    e.preventDefault()
    const validationError = validateForm(form)
    if (validationError) { setSubmitError(validationError); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const fields = {
        nickname:      form.nickname.trim(),
        bio:           form.bio.trim() || null,
        profile_url:   form.profile_url.trim() || null,
        twitter_url:   form.twitter_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        other_url:     form.other_url.trim() || null,
      }
      await saveProfile(user.id, fields, selectedEventIds)
      navigate('/cosplayers')
    } catch (err) {
      const msg = err?.message ?? ''
      const code = err?.code ?? ''
      if (msg.includes('unique') || msg.includes('duplicate') || code === '23505') {
        setSubmitError('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.')
      } else if (msg.includes('check') || code === '23514') {
        setSubmitError('입력값을 다시 확인해 주세요.')
      } else {
        setSubmitError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('프로필을 삭제하면 디렉토리에서 완전히 제거됩니다. 계속할까요?')) return
    setDeleting(true)
    try {
      await deleteProfile(profile.id)
      navigate('/cosplayers')
    } catch {
      setSubmitError('삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setDeleting(false)
    }
  }

  // ── 로딩 ──
  if (authLoading || profile === undefined) {
    return <CenteredMsg>잠시만요...</CenteredMsg>
  }

  // ── 비로그인 ──
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🎭</div>
        <h1 className="text-xl font-bold text-white mb-2">코스어 등록</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Google 계정으로 로그인하면 디렉토리에 등록할 수 있습니다.<br />
          이메일은 공개되지 않으며, 닉네임만 표시됩니다.
        </p>
        <button
          onClick={() => signInWithGoogle()}
          className="px-6 py-3 bg-white text-zinc-900 font-semibold rounded-xl hover:bg-zinc-100 transition-colors"
        >
          Google로 계속하기
        </button>
      </div>
    )
  }

  // ── 등록/수정 폼 ──
  const isEdit = !!profile

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-white mb-1">
        {isEdit ? '프로필 수정' : '코스어 등록'}
      </h1>
      <p className="text-sm text-zinc-500 mb-6">공개되는 정보: 닉네임, 소개, SNS 링크</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="닉네임 *">
          <input
            required maxLength={30}
            value={form.nickname}
            onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
            placeholder="활동명 또는 SNS 닉네임"
            className={inputCls}
          />
        </Field>

        <Field label="소개 (선택)">
          <textarea
            maxLength={200} rows={3}
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="간단한 자기소개 (최대 200자)"
            className={inputCls}
          />
        </Field>

        <Field label="프로필 사진 URL (선택)">
          <input
            type="url"
            value={form.profile_url}
            onChange={e => setForm(f => ({ ...f, profile_url: e.target.value }))}
            placeholder="https://..."
            className={inputCls}
          />
          <p className="text-xs text-zinc-500 mt-1">SNS 프로필 사진 URL을 붙여넣으세요</p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Twitter/X">
            <input type="url" value={form.twitter_url}
              onChange={e => setForm(f => ({ ...f, twitter_url: e.target.value }))}
              placeholder="https://x.com/..." className={inputCls} />
          </Field>
          <Field label="Instagram">
            <input type="url" value={form.instagram_url}
              onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
              placeholder="https://instagram.com/..." className={inputCls} />
          </Field>
          <Field label="기타 링크">
            <input type="url" value={form.other_url}
              onChange={e => setForm(f => ({ ...f, other_url: e.target.value }))}
              placeholder="https://..." className={inputCls} />
          </Field>
        </div>

        {/* 참가 예정 행사 선택 */}
        {upcomingEvents.length > 0 && (
          <Field label="참가 예정 행사 (선택, 복수 가능)">
            <div className="space-y-2">
              {upcomingEvents.map(ev => (
                <label key={ev.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedEventIds.includes(ev.id)}
                    onChange={() => toggleEvent(ev.id)}
                    className="accent-indigo-500 w-4 h-4"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                    {ev.title}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}

        {submitError && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{submitError}</p>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit" disabled={submitting}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? '저장 중...' : isEdit ? '수정 저장' : '등록하기'}
          </button>
          {isEdit && (
            <button
              type="button" onClick={handleDelete} disabled={deleting}
              className="px-4 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl transition-colors text-sm"
            >
              {deleting ? '삭제 중...' : '프로필 삭제'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function CenteredMsg({ children }) {
  return (
    <div className="py-20 text-center text-zinc-500 animate-pulse">{children}</div>
  )
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors'
