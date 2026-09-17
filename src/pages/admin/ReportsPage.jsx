import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/icons'
import Skeleton from '../../components/ui/Skeleton'
import { adminApi } from '../../lib/adminApi'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'
import { ADMIN_INPUT as input } from '../../components/ui/formStyles'
import { FOCUS_RING } from '../../components/ui/focusRing'

// 탭은 "지금 어떤 상태인가", 버튼은 "무엇을 할 것인가"다. 이름이 겹치면 —
// 탭 "반영함"과 버튼 "반영함"이 한 화면에 같이 있으면 — 누르려던 것과 다른 게 눌린다.
// 탭은 상태(됨), 버튼은 동작(처리)으로 갈라둔다.
const TABS = [
  { value: 'open', label: '처리 대기' },
  { value: 'resolved', label: '반영됨' },
  { value: 'rejected', label: '반려됨' },
]

const KIND_LABEL = { correction: '정보 오류', new_event: '행사 제보' }

// 방문자가 보낸 제보를 읽고 처리하는 화면.
//
// 검수(drafts)와 따로 두는 이유
//   drafts는 크롤러가 넣고 트리거가 승격시키는 자동 파이프라인이고, 여기는 사람이 손으로
//   쓴 글이다. 승인하면 행사가 만들어지는 쪽과, 읽고 판단해서 직접 고치는 쪽은 다루는
//   방법이 다르다 — 여기에는 "승인" 버튼이 없고 "반영함"만 있다.
export default function ReportsPage() {
  useDocumentTitle('제보 · 신고')
  const { toast } = useUIFeedback()
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)
    adminApi.listReports(status)
      .then(rows => { if (!cancelled) { setReports(rows); setError(null) } })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status])

  useEffect(() => refresh(), [refresh])

  const decide = async (report, next, note) => {
    try {
      await adminApi.updateReport(report.id, { status: next, admin_note: note?.trim() || null })
      // 지금 보고 있는 탭에서 빠지므로 목록에서 바로 뺀다 — 다시 불러오면 화면이 한 번
      // 깜빡이고, 처리하던 자리가 어디였는지 잃는다.
      setReports(list => list.filter(r => r.id !== report.id))
    } catch (err) {
      toast(`처리 실패: ${err.message}`)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-1">제보 · 신고</h2>
      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
        방문자가 로그인 없이 보낸 내용입니다. 스팸은 Worker가 IP 기준으로 1시간에 5건까지만
        받도록 막고 있습니다.
      </p>

      <div className="flex gap-2 mb-5">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${FOCUS_RING} ${
              status === tab.value ? 'bg-indigo-600 text-white font-medium' : 'text-zinc-400 hover:text-ink hover:bg-ink/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && reports.length === 0 && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {error && (
        <div className="text-center py-16">
          <Icon name="warn" className="w-8 h-8 mx-auto mb-3 text-warn" />
          <p className="text-sm text-zinc-300 mb-1">불러오지 못했습니다</p>
          <p className="text-xs text-zinc-500">{error.message}</p>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <p className="text-center py-16 text-sm text-zinc-400">
          {status === 'open' ? '처리할 제보가 없습니다' : '해당하는 제보가 없습니다'}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {reports.map(r => (
          <ReportCard key={r.id} report={r} onDecide={decide} showActions={status === 'open'} />
        ))}
      </ul>
    </div>
  )
}

function ReportCard({ report, onDecide, showActions }) {
  const [note, setNote] = useState(report.admin_note ?? '')
  const [busy, setBusy] = useState(false)

  const run = async (next) => {
    setBusy(true)
    await onDecide(report, next, note)
    setBusy(false)
  }

  return (
    <li className="bg-surface-1 border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
          report.kind === 'correction' ? 'bg-warn/15 text-warn' : 'bg-indigo-500/15 text-indigo-300'
        }`}>
          {KIND_LABEL[report.kind] ?? report.kind}
        </span>

        {/* 제보만 봐서는 어느 행사 얘기인지 id밖에 안 보여서, 서버가 제목을 함께 준다. */}
        {report.events?.title && (
          <Link
            to={`/admin/events/${encodeURIComponent(report.event_id)}`}
            className={`text-xs text-zinc-300 hover:text-ink underline underline-offset-2 rounded ${FOCUS_RING}`}
          >
            {report.events.title}
          </Link>
        )}

        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
          {report.created_at?.slice(0, 16).replace('T', ' ')}
        </span>
      </div>

      <p className="text-sm text-zinc-200 whitespace-pre-line break-words leading-relaxed mb-2">
        {report.message}
      </p>

      {report.contact && (
        <p className="text-xs text-zinc-400 mb-2">
          <span className="text-zinc-600">연락처</span> {report.contact}
        </p>
      )}

      {showActions ? (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="메모 (왜 반려했는지 등 — 선택)"
            className={`${input} flex-1 min-w-[160px]`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => run('resolved')}
            className="text-xs px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 rounded-lg transition-colors"
          >
            반영 처리
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('rejected')}
            className="text-xs px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600/40 disabled:opacity-50 text-red-400 rounded-lg transition-colors"
          >
            반려 처리
          </button>
        </div>
      ) : (
        report.admin_note && (
          <p className="text-xs text-zinc-500 border-t border-line pt-2 mt-2">
            <span className="text-zinc-600">메모</span> {report.admin_note}
          </p>
        )
      )}
    </li>
  )
}
