import { FOCUS_RING } from './focusRing'

// 서로 배타적인 선택지를 고르는 컨트롤 (상태 예정/진행중/종료, 정렬 날짜순/최신순).
//
// 예전엔 이 자리에 알약 버튼 세 개가 떨어져 있었고, 선택된 것만 indigo로 채워졌다.
// 화면의 다른 컨트롤(카테고리·월·매진)도 전부 같은 모양이라 무엇이 주 필터인지
// 구분되지 않았다. 하나의 테두리 안에 묶어 "여기서 하나를 고른다"를 형태로 보여주고,
// 선택 표시는 강조색 대신 밝은 면으로 바꿨다 — 강조색은 주 행동에만 남긴다.
export default function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex gap-0.5 p-1 bg-surface-1 border border-line rounded-xl ${className}`}
    >
      {options.map(opt => {
        const on = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg
              text-sm font-medium transition-colors ${FOCUS_RING} ${
              on ? 'bg-surface-2 text-ink shadow-sm' : 'text-zinc-400 hover:text-ink'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count != null && (
              <span className={`text-xs tabular-nums ${on ? 'text-indigo-300' : 'text-zinc-500'}`}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
