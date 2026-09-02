import { STATUS } from '../data/events'

const config = {
  [STATUS.UPCOMING]: { label: '예정', className: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' },
  [STATUS.ONGOING]:  { label: '진행중', className: 'bg-green-500/20 text-green-300 border border-green-500/30 animate-pulse' },
  [STATUS.ENDED]:    { label: '종료', className: 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30' },
}

export default function StatusBadge({ status }) {
  const { label, className } = config[status] ?? config[STATUS.ENDED]
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${className}`}>
      {label}
    </span>
  )
}
