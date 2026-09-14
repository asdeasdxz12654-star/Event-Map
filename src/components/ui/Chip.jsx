import Icon from '../icons'
import { FOCUS_RING } from './focusRing'

// 목록의 필터 칩.
//
// 세 가지 모습만 있다.
//   기본     — 카테고리 고르기처럼 켜고 끄는 것
//   ghost    — 테두리만. "필터" 버튼처럼 다른 성격의 조작
//   removable— 지금 걸려 있는 조건. 누르면 그 조건만 풀린다(✕)
//
// 예전엔 홈 화면 안에서만 같은 모양을 네 번(상태·카테고리·월·매진) 복사해 쓰고 있었고,
// 그때마다 padding과 글자 크기가 조금씩 달랐다.
export default function Chip({
  children,
  selected = false,
  variant = 'solid',
  dotColor,
  count,
  removable = false,
  className = '',
  ...rest
}) {
  const base =
    `shrink-0 inline-flex items-center gap-1.5 rounded-full text-xs lg:text-sm font-medium
     whitespace-nowrap transition-colors ${FOCUS_RING}`

  const look =
    variant === 'ghost'
      ? 'px-3 py-1.5 border border-line-strong text-zinc-400 hover:text-ink'
      : selected
        ? 'px-3 py-1.5 bg-indigo-600 text-white'
        : 'px-3 py-1.5 bg-surface-2 text-zinc-300 hover:text-ink'

  return (
    <button type="button" aria-pressed={variant === 'ghost' ? undefined : selected} className={`${base} ${look} ${className}`} {...rest}>
      {/* 카테고리 색은 예전엔 칩 배경 전체였다. 한 화면에 채도 높은 색이 넷씩 뜨면
          정작 강조해야 할 "예매하기"가 묻혀서, 구분에 필요한 만큼만 점으로 남겼다. */}
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />}
      {children}
      {count != null && (
        <span className={`text-[11px] tabular-nums ${selected ? 'text-indigo-200' : 'text-zinc-500'}`}>
          {count}
        </span>
      )}
      {removable && <Icon name="x" className="w-3 h-3 opacity-60" />}
    </button>
  )
}
