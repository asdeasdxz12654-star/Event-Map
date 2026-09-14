// 예상 혼잡도 배지 — 실시간 인원 데이터가 아니라 과거 참가 규모·매진 여부 기반
// 추정치다 (KINTEX·BEXCO 등엔 실시간 유동인구를 공개하는 공공 API가 없음).
//
// 예전엔 등급마다 채도 높은 배경색이 깔린 알약이었고, 목록 카드에도 붙었다.
// 추정치에 카드 면적과 색을 그만큼 줄 이유가 없어서 상세 화면(팩트 타일)로만 옮기고,
// 표시도 점 + 글자색으로 낮췄다.
const config = {
  low:       { label: '한산',     dot: 'bg-live',      text: 'text-live' },
  medium:    { label: '보통',     dot: 'bg-warn',      text: 'text-warn' },
  high:      { label: '혼잡',     dot: 'bg-orange-400', text: 'text-orange-300' },
  very_high: { label: '매우 혼잡', dot: 'bg-danger',    text: 'text-danger' },
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
  // config에 없는 값(DB에 새 등급이 들어온 경우 등)이면 그냥 안 그린다 —
  // 예전엔 없는 키를 구조분해하다 예외가 나서 카드·상세 화면이 통째로 오류 화면이 됐다.
  const entry = level ? config[level] : null
  if (!entry) return null
  const { label, dot, text } = entry
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${text} ${className}`}
      title="예상 혼잡도 (실시간 아님, 과거 참가 규모 기반 추정)"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
