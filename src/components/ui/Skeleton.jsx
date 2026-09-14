// 내용이 들어올 자리를 미리 그려두는 회색 블록.
//
// 예전엔 목록만 스켈레톤을 쓰고 상세는 "⏳ 불러오는 중..."이었다. 같은 앱에서
// 기다리는 모습이 두 개라 목록 → 상세 이동이 끊겨 보였다. 두 화면 모두 이걸 쓴다.
//
// 움직임을 줄이도록 설정한 기기에서는 index.css의 reduced-motion 규칙이
// animate-pulse를 멈춘다 — 회색 블록은 그대로 남으므로 뜻은 통한다.
export default function Skeleton({ className = '' }) {
  return <div className={`bg-ink/10 rounded animate-pulse ${className}`} />
}
