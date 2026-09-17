import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'

// 참가업체/무대 프로그램처럼 "공식에서 공개를 안 하거나, 아직 안 한" 정보의
// 빈 상태 안내. 두 섹션(BoothList·PerformerManager)이 같은 규칙을 쓰는데
// 각자 복사해두면 문구나 판정 기준이 갈라지기 쉬워서 한 곳에 모았다.
//
// 이 자리가 가르는 것은 세 가지다.
//
//   미공개    공식이 "안 낸다"고 한 것
//   비어 있음 공식이 아직 안 낸 것
//   못 불러옴 우리가 실패한 것            ← 이게 없어서 세 번째가 두 번째로 보였다
//
// 세 번째를 두 번째로 적으면 방문자는 부스가 없는 줄 알고 나간다. 실제로 부스 8개가
// 있는 행사에서 목록 조회만 막아보니 "아직 등록된 부스 정보가 없습니다"가 떴다.

// events.booth_info_note / stage_info_note에 이 값이 들어 있으면 "공식적으로
// 공개하지 않는 행사"라는 뜻 (크롤러 known-events.mjs, 관리자 폼과 약속된 값).
export const UNDISCLOSED = '미공개'

export default function DisclosureNote({ note, subject, emptyText, error, onRetry }) {
  // 못 불러온 것이 먼저다. 메모가 적혀 있어도, 지금 보고 있는 목록이 비어 있는 이유는
  // 그 메모가 아니라 실패이기 때문이다.
  if (error) {
    return (
      <p className="flex flex-wrap items-start gap-x-1.5 gap-y-1 text-xs text-warn">
        <Icon name="warn" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{subject} 정보를 불러오지 못했습니다.</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`text-zinc-300 hover:text-ink underline underline-offset-2 rounded ${FOCUS_RING}`}
          >
            다시 시도
          </button>
        )}
      </p>
    )
  }
  if (!note) {
    return <p className="text-xs text-zinc-400">{emptyText}</p>
  }
  if (note === UNDISCLOSED) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-zinc-400">
        <Icon name="ban" className="w-3.5 h-3.5 mt-0.5 text-zinc-500" />
        <span><span className="text-zinc-300">미공개</span> — 공식 행사에서 {subject} 정보를 공개하지 않습니다.</span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-zinc-400">
      <Icon name="info" className="w-3.5 h-3.5 mt-0.5 text-zinc-500" />
      <span>{note}</span>
    </p>
  )
}
