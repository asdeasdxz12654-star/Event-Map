import { useState } from 'react'
import { useEventDrafts, setDraftStatus } from '../../hooks/useEventDrafts'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'

const TABS = [
  { value: 'pending', label: '검수 대기' },
  { value: 'approved', label: '승인됨' },
  { value: 'rejected', label: '반려됨' },
]

const CONFIDENCE_LABEL = { high: '높음', medium: '보통', low: '낮음' }

// 로그인 문과 바깥 틀은 AdminLayout이 갖고 있다. 이 화면은 본문만 그린다.
//
// 소스 감지 패널이 예전엔 이 화면 위에 얹혀 있었는데 /admin/sources로 옮겼다.
// 둘은 성격이 다른 일이다 — 검수는 쌓여 있는 일감이고, 감지는 "지금 가서 보라"는
// 신호다. 대시보드가 둘을 각각 세어 보여주므로 한 화면에 겹쳐둘 이유가 없어졌다.
export default function DraftsPage() {
  useDocumentTitle('행사 검수')
  const [status, setStatus] = useState('pending')
  const { drafts, loading, error, refresh } = useEventDrafts(status)

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-3">행사 검수</h2>

      <div className="flex gap-2 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              status === tab.value
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-16 text-zinc-400 animate-pulse">불러오는 중...</div>
      )}

      {error && (
        <div className="text-center py-16 text-red-400">불러오기 실패</div>
      )}

      {!loading && !error && drafts.length === 0 && (
        <div className="text-center py-16 text-zinc-400">검수할 항목이 없습니다</div>
      )}

      {!loading && drafts.length > 0 && (
        <div className="space-y-4">
          {drafts.map(draft => (
            <DraftCard key={draft.id} draft={draft} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftCard({ draft, onChanged }) {
  const { toast } = useUIFeedback()
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const e = draft.extracted

  const act = async newStatus => {
    setSubmitting(true)
    setActionError(null)
    try {
      const saved = await setDraftStatus(draft.id, newStatus)
      // 승인했는데 rejected로 돌아왔다면 트리거가 자동 게시에 실패한 것이다
      // (LLM이 뽑은 카테고리가 허용값 밖이거나 날짜 형식이 깨진 경우 등).
      // 카드가 목록에서 사라지면서 인라인 에러도 같이 없어지므로 토스트로 알린다.
      if (newStatus === 'approved' && saved?.status === 'rejected') {
        toast(saved.reviewNote ?? '자동 게시에 실패해 반려 처리했습니다.')
      }
      onChanged()
    } catch {
      setActionError('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <h2 className="font-semibold text-ink">{e.title ?? '(제목 없음)'}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {draft.sourceName} · {new Date(draft.createdAt).toLocaleDateString('ko-KR')}
          </p>
        </div>
        {e.confidence && (
          <span className="text-xs px-2 py-1 rounded-lg bg-ink/10 text-zinc-300 shrink-0">
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

      {draft.reviewNote && (
        <p className="text-sm text-amber-300 bg-amber-400/10 rounded-xl px-3 py-2 mt-3">{draft.reviewNote}</p>
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
      <dt className="text-zinc-400 shrink-0">{label}:</dt>
      <dd className="text-zinc-300">{value}</dd>
    </div>
  )
}
