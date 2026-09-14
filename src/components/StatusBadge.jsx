import { STATUS } from '../data/events'

// 행사 상태 표시.
//
// 바뀐 점 두 가지.
//   1) 진행중 뱃지에 걸려 있던 animate-pulse를 뺐다. 목록을 열어두는 내내 화면
//      어딘가가 계속 깜빡이는 건 정보가 아니라 소음이다. 살아 있다는 표시는
//      점 하나로 충분하다.
//   2) 예정·종료는 중립 면으로 낮췄다. 목록에서 "예정"은 D-day가 이미 말해주고,
//      색이 필요한 건 지금 열리고 있는 행사 하나뿐이다.
const config = {
  [STATUS.UPCOMING]: { label: '예정',  className: 'bg-surface-2 text-zinc-300', dot: null },
  [STATUS.ONGOING]:  { label: '진행중', className: 'bg-live/15 text-live',      dot: 'bg-live' },
  [STATUS.ENDED]:    { label: '종료',  className: 'bg-surface-2 text-zinc-500', dot: null },
}

export default function StatusBadge({ status }) {
  const { label, className, dot } = config[status] ?? config[STATUS.ENDED]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />}
      {label}
    </span>
  )
}
