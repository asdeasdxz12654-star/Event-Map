import { useState } from 'react'
import { boothHue, splitBoothName } from '../lib/boothKinds'

// 부스가 아주 많을 때 쓰는 목록.
//
// 코믹월드는 개인 서클 부스가 수백에서 수천 개다. 그 규모에서 카드를 쌓으면 아무도
// 못 찾고, 칩으로 하나씩 고르게 하는 것도 불가능하다. 이때 사람들이 하는 질문은
// 하나뿐이다 — "내가 찾는 곳이 몇 번인가". 그래서 한 줄에 번호·이름·장르만 담고
// 찾기는 검색에 맡긴다.
//
// 한 번에 전부 그리지 않는 이유: 2,000줄을 DOM에 올리면 저사양 기기에서 스크롤이
// 끊긴다. 가상 스크롤 라이브러리를 넣는 대신 "더 보기"로 끊어 싣는다 — 검색으로
// 좁히는 게 기본 동선이라 끝까지 내려가는 일이 드물다.
const PAGE = 100

export default function BoothDenseList({ booths, onSelect }) {
  const [shown, setShown] = useState(PAGE)
  const list = booths.slice(0, shown)

  return (
    <div className="flex flex-col gap-2">
      <ul className="border border-line rounded-2xl overflow-hidden bg-surface-1 divide-y divide-line">
        {list.map(booth => {
          const { main, sub } = splitBoothName(booth.name)
          return (
            <li key={booth.id}>
              <button
                type="button"
                onClick={() => onSelect?.(booth)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-400 focus:outline-none"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: `hsl(${boothHue(booth.name)} 45% 55%)` }}
                  aria-hidden="true"
                />
                {booth.boothNo && (
                  <span className="shrink-0 w-14 text-xs text-indigo-300 tabular-nums">{booth.boothNo}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink truncate">{main}</span>
                  {sub && <span className="block text-xs text-zinc-500 truncate">{sub}</span>}
                </span>
                {booth.genre && <span className="shrink-0 text-[11px] text-zinc-500">{booth.genre}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {shown < booths.length && (
        <button
          type="button"
          onClick={() => setShown(n => n + PAGE)}
          className="w-full py-2.5 text-sm text-zinc-400 hover:text-ink border border-line rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 focus:outline-none"
        >
          {booths.length - shown}곳 더 보기
        </button>
      )}
    </div>
  )
}
