import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { supabase } from '../supabase'
import { adminApi } from '../lib/adminApi'
import { useUIFeedback } from '../contexts/UIFeedbackContext'

// 공식 소스 감지 결과.
//
// 부스·무대·굿즈·배치도는 전부 사람이 넣어야 하는데, "언제 올라오는지"를 아무도
// 알려주지 않는 것이 유일하게 비어 있던 고리였다. 매일 도는 워크플로가
// (watch-sources.mjs) 정해진 주소를 열어 달라진 것을 여기 쌓아둔다.
//
// 값을 자동으로 채우지는 않는다. 이미지 속 가격표·시간표를 모델로 읽는 건 이 저장소가
// 이미 틀린 값을 만들어 본 방법이라, 읽는 일은 사람이 한다. 여기서는 "가서 보세요"까지만.
export default function SourceWatchPanel() {
  const { toast } = useUIFeedback()
  const [watches, setWatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('source_watches')
      .select('*')
      .order('last_changed_at', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        // 테이블이 아직 없으면(마이그레이션 실행 전) 조용히 비워둔다.
        setWatches(error ? [] : data)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const ack = async (watch) => {
    setBusyKey(watch.key)
    try {
      await adminApi.ackWatch(watch.key)
      const now = new Date().toISOString()
      setWatches(list => list.map(w => (w.key === watch.key ? { ...w, acknowledged_at: now } : w)))
    } catch (err) {
      toast(`확인 처리 실패: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  if (loading || watches.length === 0) return null

  // 바뀐 뒤 아직 확인하지 않은 것만 "새 것"이다.
  const fresh = watches.filter(w => w.last_changed_at && (!w.acknowledged_at || w.acknowledged_at < w.last_changed_at))
  const broken = watches.filter(w => w.last_error)

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-lg font-semibold text-ink">공식 소스 감지</h2>
        <span className="text-xs text-zinc-400 tabular-nums">
          {fresh.length > 0 ? `새 변경 ${fresh.length}건` : `${watches.length}곳 감시 중`}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {watches.map(w => {
          const isFresh = fresh.includes(w)
          const candidates = Array.isArray(w.candidates) ? w.candidates : []
          return (
            <li
              key={w.key}
              className={`border rounded-xl p-3 ${isFresh ? 'border-indigo-500/50 bg-indigo-600/10' : 'border-line bg-surface-1'}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{w.label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {w.last_error
                      ? <span className="text-danger">{w.last_error}</span>
                      : isFresh
                        ? <span className="text-indigo-300">{ago(w.last_changed_at)} 바뀜 — 가서 확인해 주세요</span>
                        : w.last_changed_at
                          ? `마지막 변경 ${ago(w.last_changed_at)}`
                          : '아직 변화 없음'}
                    {w.last_checked_at && <span className="text-zinc-500"> · {ago(w.last_checked_at)} 확인</span>}
                  </p>
                </div>

                <a
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 rounded ${FOCUS_RING}`}
                >
                  열기 <Icon name="external" className="w-3 h-3" />
                </a>

                {isFresh && (
                  <button
                    type="button"
                    onClick={() => ack(w)}
                    disabled={busyKey === w.key}
                    className={`shrink-0 text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg ${FOCUS_RING}`}
                  >
                    확인함
                  </button>
                )}
              </div>

              {/* 배치도 후보. 자동으로 게시하지 않는다 — 틀린 배치도는 사람을 엉뚱한
                  홀로 보낸다. 주소를 복사해 행사 수정 화면의 배치도 칸에 넣으면 된다. */}
              {isFresh && candidates.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-line">
                  <p className="text-[11px] text-zinc-400 mb-1.5">
                    배치도 후보 {candidates.length}장 — 맞는 것을 골라 행사 수정 화면의 배치도 칸에 넣어 주세요
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {candidates.map(c => (
                      <a
                        key={c.url}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`shrink-0 w-28 rounded-lg overflow-hidden border border-line ${FOCUS_RING}`}
                      >
                        <img src={c.url} alt="" loading="lazy" className="w-full h-16 object-cover bg-surface-2" />
                        <span className="block px-1.5 py-1 text-[10px] text-zinc-400 tabular-nums">
                          {c.width}×{c.height}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {broken.length > 0 && (
        <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
          실패한 감시는 사이트 구조가 바뀌었을 수 있습니다 —
          <code className="mx-1">crawler/src/source-watches.mjs</code>의 match를 손봐야 합니다.
        </p>
      )}
    </section>
  )
}

function ago(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko })
  } catch {
    return iso
  }
}
