import Icon from './icons'
import { UNDISCLOSED } from './DisclosureNote'
import { FOCUS_RING } from './ui/focusRing'

// 개요 탭 맨 위의 안내판.
//
// 탭이 다섯 개가 되면 개요는 "나머지 전부"가 아니라 입구가 되어야 한다. 이 행사에
// 무엇이 얼마나 있는지 한눈에 보여주고 각 탭으로 보낸다.
//
// 비어 있는 칸도 자리를 지킨다 — 이 화면은 "등록된 게 없다"와 "원래 없는 행사"를
// 구분해 적어 온 곳이다. 아직 확인하지 못한 것(메모도 없음)만 칸을 만들지 않는다.
export default function OverviewSummary({ tiles, onJump }) {
  const shown = tiles.filter(t => t.count > 0 || t.note)
  if (shown.length === 0) return null

  return (
    <dl className="grid grid-cols-2 gap-px bg-line border border-line rounded-2xl overflow-hidden mb-4">
      {shown.map(tile => {
        const has = tile.count > 0
        const body = (
          <>
            <dt className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1.5">
              <Icon name={tile.icon} className="w-3.5 h-3.5" />
              {tile.label}
            </dt>
            <dd>
              {has ? (
                <>
                  <span className="text-sm font-semibold text-ink tabular-nums">{tile.value}</span>
                  {tile.hint && <span className="block text-[11px] text-zinc-400 mt-0.5 tabular-nums">{tile.hint}</span>}
                </>
              ) : (
                <span className="text-xs text-zinc-400 leading-snug block">
                  {tile.note === UNDISCLOSED ? '공식 미공개' : tile.note}
                </span>
              )}
            </dd>
          </>
        )

        return has ? (
          <button
            key={tile.label}
            type="button"
            onClick={() => onJump?.(tile.tab)}
            className={`bg-surface-1 p-3 text-left flex items-start gap-2 hover:bg-surface-2 transition-colors ${FOCUS_RING}`}
          >
            <span className="flex-1 min-w-0">{body}</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5 text-zinc-500 mt-0.5" />
          </button>
        ) : (
          <div key={tile.label} className="bg-surface-1 p-3">{body}</div>
        )
      })}
    </dl>
  )
}
