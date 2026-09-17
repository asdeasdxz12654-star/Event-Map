import { Link } from 'react-router-dom'
import Icon from '../../components/icons'
import Skeleton from '../../components/ui/Skeleton'
import { useAdminStats } from '../../hooks/useAdminStats'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { FOCUS_RING } from '../../components/ui/focusRing'

// 관리자 첫 화면.
//
// 이 화면이 답해야 하는 질문은 하나다 — "지금 내가 손봐야 할 게 뭐지?"
// 그래서 순서를 할 일 → 빈 자리 → 현황으로 둔다. 숫자를 자랑하는 화면이 아니라
// 일감을 꺼내주는 화면이다. 아무것도 없으면 "밀린 일 없음"이라고 분명히 말한다.
//
// 여기 있는 항목은 전부 지금까지 사람이 우연히 발견했던 문제들이다 —
// 중복 행사는 목록에서 눈으로, 굿즈 사진 0장은 SQL로, 감시 알림은 로그로 찾았다.
export default function DashboardPage() {
  useDocumentTitle('관리자')
  const { stats, loading, error, refresh } = useAdminStats()

  if (loading && !stats) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="bg-surface-1 border border-line rounded-2xl p-6 text-center">
        <Icon name="warn" className="w-8 h-8 mx-auto mb-3 text-warn" />
        <p className="text-sm text-zinc-300 mb-1">집계를 불러오지 못했습니다</p>
        <p className="text-xs text-zinc-500 mb-4">{error.message}</p>
        <button
          type="button"
          onClick={refresh}
          className={`text-xs px-3 py-1.5 bg-surface-2 hover:bg-line text-ink rounded-lg transition-colors ${FOCUS_RING}`}
        >
          다시 시도
        </button>
      </div>
    )
  }

  const todo = [
    {
      to: '/admin/drafts',
      icon: 'list',
      label: '검수 대기',
      count: stats.pendingDrafts,
      hint: '크롤러가 모아온 기사',
    },
    {
      to: '/admin/sources',
      icon: 'bell',
      label: '새 변경 감지',
      count: stats.freshWatches,
      hint: stats.brokenWatches > 0 ? `감시 실패 ${stats.brokenWatches}곳` : '공식 사이트가 달라짐',
      warn: stats.brokenWatches > 0,
    },
    {
      to: '/admin/reports',
      icon: 'warn',
      label: '제보 · 신고',
      count: stats.openReports,
      hint: '방문자가 보낸 것',
    },
    {
      icon: 'warn',
      label: '중복 의심',
      count: stats.duplicates.length,
      hint: '제목·시작일이 같은 행사',
    },
  ]

  // 못 센 항목(null)도 보여준다 — 숨기면 '할 일 없음'으로 읽힌다.
  const openTodo = todo.filter(t => t.count == null || t.count > 0)

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>할 일</SectionTitle>
        {openTodo.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-zinc-400 bg-surface-1 border border-line rounded-2xl px-4 py-3.5">
            <Icon name="check" className="w-4 h-4 text-live" />
            밀린 일이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {openTodo.map(item => <TodoCard key={item.label} {...item} />)}
          </div>
        )}
      </section>

      {stats.duplicates.length > 0 && (
        <section>
          <SectionTitle hint="같은 행사를 두 번 등록했을 수 있습니다. 하위 데이터가 있는 쪽을 남기세요.">
            중복 의심 행사
          </SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {stats.duplicates.map(dup => (
              <li
                key={dup.ids.join()}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-surface-1 border border-line rounded-xl px-3.5 py-2.5"
              >
                <span className="text-sm text-ink font-medium">{dup.title}</span>
                <span className="text-xs text-zinc-500 tabular-nums">{dup.startDate}</span>
                <span className="text-xs text-danger">{dup.ids.length}건</span>
                <span className="basis-full sm:basis-auto sm:ml-auto flex flex-wrap gap-1.5">
                  {dup.ids.map(id => (
                    <Link
                      key={id}
                      to={`/events/${id}`}
                      className={`text-[11px] font-mono text-zinc-400 hover:text-ink bg-surface-2 px-2 py-1 rounded-lg transition-colors ${FOCUS_RING}`}
                    >
                      {id}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle hint="채워지지 않은 자리입니다. 공식이 아직 발표 전이면 '미공개'로 적어두면 여기서 빠집니다.">
          빈 자리
        </SectionTitle>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden">
          <Gap label="포스터 없음" value={stats.gaps.noPoster} />
          <Gap label="좌표 없음" value={stats.gaps.noCoords} />
          <Gap label="배치도 없음" value={stats.gaps.noFloorPlan} hint="진행 예정만" />
          <Gap label="굿즈 사진 없음" value={stats.gaps.goodsNoImage} />
          <Gap label="공개 상태 미기재" value={stats.gaps.noDisclosure} hint="진행 예정만" />
        </dl>
        <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
          “공개 상태 미기재”는 부스·무대·굿즈·코스어 안내가 하나라도 비어 있는 행사입니다.
          비어 있으면 그 탭이 아예 안 생겨서, 방문자는 “아직 발표 전”인지 “원래 없는 행사”인지
          알 수 없습니다. 발표 전이면 “미공개”라고만 적어도 그 자리가 생깁니다.
        </p>
      </section>

      <section>
        <SectionTitle>행사</SectionTitle>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden">
          <Gap label="예정" value={stats.events.upcoming} tone="ink" />
          <Gap label="진행중" value={stats.events.ongoing} tone="live" />
          <Gap label="종료" value={stats.events.ended} tone="muted" />
          <Gap label="전체" value={stats.events.total} tone="ink" />
        </dl>
      </section>

      {stats.locked > 0 && (
        <section>
          <SectionTitle>크롤러 자동 갱신 꺼짐</SectionTitle>
          <p className="text-sm text-zinc-300 bg-surface-1 border border-line rounded-2xl px-4 py-3.5 leading-relaxed">
            <span className="font-semibold text-ink tabular-nums">{stats.locked}건</span>의 행사를 직접 수정했습니다.
            <span className="block text-xs text-zinc-400 mt-1">
              직접 수정한 행사는 크롤러가 건드리지 않습니다 — 내가 고친 값이 덮어써지지 않는 대신,
              공식이 나중에 포스터·예매 링크를 올려도 자동으로 채워지지 않습니다.
              행사 편집 화면에서 다시 켤 수 있습니다.
            </span>
          </p>
        </section>
      )}
    </div>
  )
}

function SectionTitle({ children, hint }) {
  return (
    <div className="mb-2">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {hint && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

function TodoCard({ to, icon, label, count, hint, warn }) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name={icon} className={`w-4 h-4 ${warn ? 'text-warn' : 'text-zinc-400'}`} />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none mb-1.5 ${count == null ? 'text-zinc-600' : 'text-ink'}`}>
        {count == null ? '—' : count}
      </p>
      <p className={`text-[11px] ${warn ? 'text-warn' : 'text-zinc-500'}`}>{hint}</p>
    </>
  )
  const cls = 'block text-left bg-surface-1 border border-line rounded-2xl p-3.5 min-w-0'
  return to
    ? <Link to={to} className={`${cls} hover:border-line-strong transition-colors ${FOCUS_RING}`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

function Gap({ label, value, hint, tone = 'auto' }) {
  // 못 센 값(null)은 숫자로 적지 않는다. 0으로 적으면 "빈 자리 없음"이라는 거짓말이 된다.
  const unknown = value == null
  // 빈 자리는 0일 때가 좋은 소식이다 — 0이면 흐리게, 있으면 또렷하게.
  const color =
    unknown ? 'text-zinc-600'
      : tone === 'live' ? 'text-live'
        : tone === 'muted' ? 'text-zinc-400'
          : tone === 'ink' ? 'text-ink'
            : value > 0 ? 'text-ink' : 'text-zinc-500'
  return (
    <div className="bg-surface-1 p-3 lg:p-3.5 min-w-0">
      <dt className="text-[11px] text-zinc-400 mb-1.5 truncate">
        {label}
        {hint && <span className="text-zinc-600"> · {hint}</span>}
      </dt>
      <dd className={`text-lg font-semibold tabular-nums ${color}`} title={unknown ? '세지 못했습니다' : undefined}>
        {unknown ? '—' : value}
      </dd>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-4 w-16 mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <span className="sr-only" role="status">집계를 불러오는 중입니다</span>
    </div>
  )
}
