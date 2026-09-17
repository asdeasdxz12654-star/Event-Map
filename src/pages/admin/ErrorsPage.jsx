import { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/icons'
import Skeleton from '../../components/ui/Skeleton'
import { adminApi } from '../../lib/adminApi'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'
import { FOCUS_RING } from '../../components/ui/focusRing'

// 탭은 상태(됨), 버튼은 동작(처리). 제보 화면과 같은 규칙이다 —
// 이름이 겹치면 누르려던 것과 다른 게 눌린다.
const TABS = [
  { value: 'open', label: '열림' },
  { value: 'resolved', label: '처리됨' },
  { value: 'ignored', label: '무시함' },
]

const KIND = {
  boundary: { label: '화면 깨짐', cls: 'bg-danger/15 text-danger' },
  error: { label: '실행 오류', cls: 'bg-warn/15 text-warn' },
  unhandledrejection: { label: '처리 안 된 Promise', cls: 'bg-indigo-500/15 text-indigo-300' },
}

// 방문자 화면에서 난 오류를 읽는 화면.
//
// 지금까지 이런 고장은 방문자 브라우저 콘솔에만 남았고, 우리가 알 수 있는 유일한 길은
// 그 사람이 직접 제보를 보내주는 것뿐이었다. 대부분은 그냥 창을 닫는다.
//
// 한 줄 = 한 종류의 오류다. 같은 고장이 백 번 나도 한 줄이고 count가 올라간다 —
// 발생마다 쌓으면 인기 있는 고장 하나가 목록을 덮고, "어제부터 새로 생긴 것"이 묻힌다.
export default function ErrorsPage() {
  useDocumentTitle('앱 오류')
  const { toast } = useUIFeedback()
  const [status, setStatus] = useState('open')
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const refresh = useCallback(() => {
    let cancelled = false
    setLoading(true)
    adminApi.listClientErrors(status)
      .then(rows => { if (!cancelled) { setErrors(rows); setLoadError(null) } })
      .catch(err => { if (!cancelled) setLoadError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status])

  useEffect(() => refresh(), [refresh])

  const decide = async (row, next) => {
    try {
      await adminApi.updateClientError(row.id, { status: next })
      // 지금 보고 있는 탭에서 빠지므로 목록에서 바로 뺀다 — 다시 불러오면 화면이
      // 깜빡이고 보던 자리를 잃는다.
      setErrors(list => list.filter(r => r.id !== row.id))
    } catch (err) {
      toast(`처리 실패: ${err.message}`)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-1">앱 오류</h2>
      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
        방문자 브라우저에서 난 오류입니다. 같은 오류는 한 줄로 묶이고 횟수만 올라갑니다.
        브라우저 확장·끊긴 요청처럼 우리가 고칠 수 없는 것은 애초에 안 올라옵니다
        (<code className="text-zinc-400">src/lib/errorReporter.js</code>).
        “처리됨”으로 표시한 오류가 또 나면 자동으로 다시 열립니다 — “무시함”은 그대로 남습니다.
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

      {loading && errors.length === 0 && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {loadError && (
        <div className="text-center py-16">
          <Icon name="warn" className="w-8 h-8 mx-auto mb-3 text-warn" />
          <p className="text-sm text-zinc-300 mb-1">불러오지 못했습니다</p>
          <p className="text-xs text-zinc-500 mb-2">{loadError.message}</p>
          <p className="text-[11px] text-zinc-600">
            <code>supabase/client_errors_2026-09-17.sql</code>을 아직 실행하지 않았다면 그것부터 돌려주세요.
          </p>
        </div>
      )}

      {!loading && !loadError && errors.length === 0 && (
        <p className="text-center py-16 text-sm text-zinc-400">
          {status === 'open' ? '열린 오류가 없습니다' : '해당하는 오류가 없습니다'}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {errors.map(row => (
          <ErrorCard key={row.id} row={row} onDecide={decide} showActions={status === 'open'} />
        ))}
      </ul>
    </div>
  )
}

function ErrorCard({ row, onDecide, showActions }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const kind = KIND[row.kind] ?? { label: row.kind, cls: 'bg-surface-2 text-zinc-400' }

  const run = async (next) => {
    setBusy(true)
    await onDecide(row, next)
    setBusy(false)
  }

  return (
    <li className="bg-surface-1 border border-line rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${kind.cls}`}>{kind.label}</span>
        {row.path && <code className="text-[11px] text-zinc-400 bg-surface-2 px-1.5 py-0.5 rounded">{row.path}</code>}
        <span className="text-[11px] text-zinc-500 tabular-nums">{row.count}번</span>
        <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
          {row.last_seen_at?.slice(0, 16).replace('T', ' ')}
        </span>
      </div>

      <p className="text-sm text-zinc-200 break-words leading-relaxed font-mono">{row.message}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-zinc-500">
        <span>처음 {row.first_seen_at?.slice(0, 10)}</span>
        {/* 이미 고친 오류가 옛 빌드를 열어둔 탭에서 계속 올라오는 것을,
            아직 안 고쳐진 새 고장으로 착각하지 않으려면 이게 필요하다. */}
        {row.app_build && <span>빌드 <code className="text-zinc-400">{row.app_build}</code></span>}
        {row.stack && (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className={`text-zinc-400 hover:text-ink underline underline-offset-2 rounded ${FOCUS_RING}`}
            aria-expanded={open}
          >
            {open ? '스택 접기' : '스택 보기'}
          </button>
        )}
      </div>

      {open && row.stack && (
        <pre className="mt-2 text-[11px] text-zinc-400 bg-surface-2 rounded-lg p-3 overflow-x-auto whitespace-pre">
          {row.stack}
        </pre>
      )}

      {open && row.user_agent && (
        <p className="mt-1.5 text-[11px] text-zinc-500 break-words">{row.user_agent}</p>
      )}

      {showActions && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run('resolved')}
            className="text-xs px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-50 text-emerald-400 rounded-lg transition-colors"
          >
            처리 완료
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('ignored')}
            className="text-xs px-2.5 py-1.5 bg-surface-2 hover:bg-line disabled:opacity-50 text-zinc-400 rounded-lg transition-colors"
          >
            무시
          </button>
          <span className="text-[11px] text-zinc-600">
            “무시”는 또 나도 다시 열리지 않습니다 — 우리가 어쩔 수 없는 것에만 쓰세요.
          </span>
        </div>
      )}
    </li>
  )
}
