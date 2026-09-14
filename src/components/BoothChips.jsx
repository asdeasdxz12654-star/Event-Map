import { boothHue, splitBoothName } from '../lib/boothKinds'

// 부스를 하나씩 골라 보는 가로 칩 줄. 부스 탭과 굿즈 탭이 같은 걸 쓴다 —
// 두 탭에서 고르는 방식이 다르면 같은 행사 안에서 조작법을 두 번 배워야 한다.
//
// 색은 부스 이름에서 뽑은 고정 색(boothHue)이라, 칩의 점과 아래 카드의 썸네일이
// 같은 색으로 이어진다. 지금 무엇을 보고 있는지가 스크롤 중에도 유지된다.
export default function BoothChips({ booths, selectedId, onSelect, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1"
    >
      {booths.map(booth => {
        const on = booth.id === selectedId
        const hue = boothHue(booth.name)
        return (
          <button
            key={booth.id}
            onClick={() => onSelect(booth.id)}
            aria-pressed={on}
            className={`shrink-0 flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-xs transition-colors ${
              on ? 'text-ink font-semibold' : 'border-ink/10 text-zinc-400 hover:text-ink'
            }`}
            style={on ? {
              borderColor: `hsl(${hue} 45% 45%)`,
              backgroundColor: `hsl(${hue} 45% 45% / 0.14)`,
            } : undefined}
          >
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded shrink-0"
              style={{ background: `hsl(${hue} 45% 45%)` }}
            />
            {splitBoothName(booth.name).main}
          </button>
        )
      })}
    </div>
  )
}
