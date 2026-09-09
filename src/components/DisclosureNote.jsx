// 참가업체/무대 프로그램처럼 "공식에서 공개를 안 하거나, 아직 안 한" 정보의
// 빈 상태 안내. 두 섹션(BoothManager·PerformerManager)이 같은 규칙을 쓰는데
// 각자 복사해두면 문구나 판정 기준이 갈라지기 쉬워서 한 곳에 모았다.

// events.booth_info_note / stage_info_note에 이 값이 들어 있으면 "공식적으로
// 공개하지 않는 행사"라는 뜻 (크롤러 known-events.mjs, 관리자 폼과 약속된 값).
export const UNDISCLOSED = '미공개'

export default function DisclosureNote({ note, subject, emptyText }) {
  if (!note) {
    return <p className="text-xs text-zinc-500">{emptyText}</p>
  }
  if (note === UNDISCLOSED) {
    return (
      <p className="text-xs text-zinc-500">
        <span className="text-zinc-400">🚫 미공개</span> — 공식 행사에서 {subject} 정보를 공개하지 않습니다.
      </p>
    )
  }
  return <p className="text-xs text-zinc-500">ℹ️ {note}</p>
}
