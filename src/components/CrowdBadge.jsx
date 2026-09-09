// 예상 혼잡도 배지 — 실시간 인원 데이터가 아니라 과거 참가 규모·매진 여부 기반
// 추정치다 (KINTEX·BEXCO 등엔 실시간 유동인구를 공개하는 공공 API가 없음).
const config = {
  low:       { label: '한산',    emoji: '🟢', className: 'bg-green-500/20 text-green-300 border border-green-500/30' },
  medium:    { label: '보통',    emoji: '🟡', className: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
  high:      { label: '혼잡',    emoji: '🟠', className: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
  very_high: { label: '매우 혼잡', emoji: '🔴', className: 'bg-red-500/20 text-red-300 border border-red-500/30' },
}

// 매진이면 표기된 등급과 무관하게 최소 '혼잡'로 올려서 보여준다.
export function resolveCrowdLevel(crowdLevel, ticketStatus) {
  if (ticketStatus === 'soldout') {
    return crowdLevel === 'very_high' ? 'very_high' : 'high'
  }
  return crowdLevel ?? null
}

export default function CrowdBadge({ crowdLevel, ticketStatus, className = '' }) {
  const level = resolveCrowdLevel(crowdLevel, ticketStatus)
  if (!level) return null
  const { label, emoji, className: levelClassName } = config[level]
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${levelClassName} ${className}`}
      title="예상 혼잡도 (실시간 아님, 과거 참가 규모 기반 추정)"
    >
      {emoji} {label}
    </span>
  )
}
