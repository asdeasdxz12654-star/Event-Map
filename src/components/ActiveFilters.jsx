import Chip from './ui/Chip'
import { FOCUS_RING } from './ui/focusRing'

// 지금 걸려 있는 조건과 결과 건수.
//
// 예전에는 이런 줄이 없었다. 카테고리·월·매진 제외가 동시에 걸린 채로 결과가 0건이면
// 어느 조건 때문인지 알 방법이 없었고, 되돌릴 수단도 검색어 지우기 하나뿐이었다.
// (코드에 effectiveMonth 같은 안전장치를 둬야 했던 것 자체가 이 구조가 혼란스럽다는
//  신호였다.) 조건을 숨기는 대신 항상 드러내고, 칩 하나하나를 눌러 풀 수 있게 한다.
//
// 걸린 조건이 없으면 이 줄은 건수만 남는다.
export default function ActiveFilters({ items, onClearAll, resultCount, sortLabel, searching }) {
  const has = items.length > 0

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      {items.map(item => (
        <Chip key={item.key} removable onClick={item.onRemove} aria-label={`${item.label} 조건 해제`}>
          {item.label}
        </Chip>
      ))}

      {has && (
        <button
          type="button"
          onClick={onClearAll}
          className={`text-xs text-zinc-400 hover:text-ink underline underline-offset-2 px-1 py-1 rounded ${FOCUS_RING}`}
        >
          전체 해제
        </button>
      )}

      {/* 조건을 바꾸면 결과 수가 바뀐다는 걸 스크린리더에도 알린다 */}
      <p className="ml-auto text-xs text-zinc-400 tabular-nums" aria-live="polite">
        {searching ? `검색 결과 ${resultCount}건` : `${resultCount}개 행사`}
        {sortLabel && ` · ${sortLabel}`}
      </p>
    </div>
  )
}
