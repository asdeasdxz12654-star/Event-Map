import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEventDrafts, setDraftStatus } from '../hooks/useEventDrafts'
import { useEvents } from '../hooks/useEvents'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL

const TABS = [
  { value: 'pending', label: '검수 대기' },
  { value: 'approved', label: '승인됨' },
  { value: 'rejected', label: '반려됨' },
]

const CONFIDENCE_LABEL = { high: '높음', medium: '보통', low: '낮음' }

export default function AdminDraftsPage() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()
  const [status, setStatus] = useState('pending')
  const { drafts, loading, error, refresh } = useEventDrafts(status)
  // 이미 게시된 행사와 날짜가 겹치는 draft를 찾아 검수 화면에서 경고해주기 위함 —
  // 크롤러 소스마다 같은 행사를 다른 제목으로 추출하면(예: "코믹월드 336" vs "코믹월드 336
  // 일산") promote_event_draft()의 제목+날짜 dedup을 피해가서, 승인 시 조용히 중복 행사가
  // 만들어질 수 있다. 제목이 달라도 여기서는 걸러줘서 검수자가 눈으로 확인할 수 있게 한다.
  const { events: publishedEvents } = useEvents()

  // ── 로딩 ──
  if (authLoading) {
    return <div className="py-20 text-center text-zinc-500 animate-pulse">잠시만요...</div>
  }

  // ── 비로그인 ──
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🛠️</div>
        <h1 className="text-xl font-bold text-white mb-2">행사 검수</h1>
        <p className="text-zinc-400 text-sm mb-8">관리자만 접근 가능합니다. Google 계정으로 로그인해 주세요.</p>
        <button
          onClick={() => signInWithGoogle('/admin/drafts')}
          className="px-6 py-3 bg-white text-zinc-900 font-semibold rounded-xl hover:bg-zinc-100 transition-colors"
        >
          Google로 계속하기
        </button>
      </div>
    )
  }

  // ── 관리자 아님 ──
  if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-white mb-2">접근 권한이 없습니다</h1>
        <p className="text-zinc-400 text-sm">이 페이지는 관리자 계정으로만 이용할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-white">행사 검수</h1>
        <button onClick={signOut} className="text-sm text-zinc-500 hover:text-white transition-colors">
          로그아웃
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              status === tab.value
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-16 text-zinc-500 animate-pulse">불러오는 중...</div>
      )}

      {error && (
        <div className="text-center py-16 text-red-400">불러오기 실패</div>
      )}

      {!loading && !error && drafts.length === 0 && (
        <div className="text-center py-16 text-zinc-500">검수할 항목이 없습니다</div>
      )}

      {!loading && drafts.length > 0 && (
        <div className="space-y-4">
          {drafts.map(draft => (
            <DraftCard key={draft.id} draft={draft} publishedEvents={publishedEvents} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftCard({ draft, publishedEvents, onChanged }) {
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const e = draft.extracted

  // 제목이 달라도 시작일이 같은 기존 행사가 있으면 같은 행사의 중복일 수 있다 — 승인 전
  // 검수자가 확인할 수 있게 경고한다. 이미 이 draft로 만들어진 행사 자신은 제외한다.
  const possibleDuplicates = e.start_date
    ? (publishedEvents ?? []).filter(ev => ev.startDate === e.start_date && ev.id !== draft.promotedEventId)
    : []

  const act = async newStatus => {
    setSubmitting(true)
    setActionError(null)
    try {
      await setDraftStatus(draft.id, newStatus)
      onChanged()
    } catch {
      setActionError('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <h2 className="font-semibold text-white">{e.title ?? '(제목 없음)'}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {draft.sourceName} · {new Date(draft.createdAt).toLocaleDateString('ko-KR')}
          </p>
        </div>
        {e.confidence && (
          <span className="text-xs px-2 py-1 rounded-lg bg-white/10 text-zinc-300 shrink-0">
            신뢰도: {CONFIDENCE_LABEL[e.confidence] ?? e.confidence}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-300 mb-3">
        {e.category && <Row label="카테고리" value={e.category} />}
        {(e.start_date || e.end_date) && (
          <Row label="기간" value={`${e.start_date ?? '?'} ~ ${e.end_date ?? '?'}`} />
        )}
        {e.venue && <Row label="장소" value={e.venue} />}
        {e.admission_fee && <Row label="입장료" value={e.admission_fee} />}
      </dl>

      {e.description && <p className="text-sm text-zinc-400 mb-3">{e.description}</p>}

      <a
        href={draft.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-indigo-400 hover:text-indigo-300 break-all"
      >
        원문 보기: {draft.sourceTitle}
      </a>

      {possibleDuplicates.length > 0 && (
        <div className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2 mt-3">
          ⚠️ 같은 날짜({e.start_date})에 이미 게시된 행사가 있어요 — 제목만 다른 같은 행사일 수 있으니 승인 전에 확인하세요:
          <ul className="mt-1 space-y-0.5">
            {possibleDuplicates.map(ev => (
              <li key={ev.id}>· {ev.title} ({ev.venue ?? '장소 미상'})</li>
            ))}
          </ul>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2 mt-3">{actionError}</p>
      )}

      {draft.status === 'pending' && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => act('approved')}
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 rounded-xl transition-colors text-sm"
          >
            승인
          </button>
          <button
            onClick={() => act('rejected')}
            disabled={submitting}
            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 text-red-400 rounded-xl transition-colors text-sm"
          >
            반려
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex gap-1">
      <dt className="text-zinc-500 shrink-0">{label}:</dt>
      <dd className="text-zinc-300">{value}</dd>
    </div>
  )
}
