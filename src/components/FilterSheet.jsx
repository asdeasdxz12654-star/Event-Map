import Chip from './ui/Chip'
import Segmented from './ui/Segmented'
import Sheet from './ui/Sheet'
import { FOCUS_RING } from './ui/focusRing'

function Switch({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3 py-2 cursor-pointer">
      <span className="text-sm text-ink">{label}</span>
      <span className="relative shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className={`peer sr-only ${FOCUS_RING}`}
        />
        <span className="block w-11 h-6 rounded-full bg-surface-2 peer-checked:bg-indigo-600 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-400" />
        <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

// 자주 바꾸지 않는 목록 설정 — 기간·정렬·매진 숨김·카드 크기.
//
// 넷 다 예전엔 목록 위에 상시 노출돼 있었다. 특히 카드 크기(열 수)는 한 번 정하면
// 다시 안 바꾸는 값인데(그래서 localStorage에 저장한다) 매번 보는 자리를 차지했다.
// 기능은 그대로 두고 자리만 옮긴다 — 대신 무엇이 걸려 있는지는 ActiveFilters가
// 목록 위에 항상 보여준다.
export default function FilterSheet({
  months, monthLabel, month, onMonthChange,
  sort, onSortChange,
  hideSoldout, onHideSoldoutChange,
  columns, onColumnsChange,
  resultCount, onClose,
}) {
  return (
    <Sheet
      title="필터"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className={`w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors ${FOCUS_RING}`}
        >
          {resultCount}개 행사 보기
        </button>
      }
    >
      {months.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-zinc-400 mb-2">기간</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip selected={month === null} onClick={() => onMonthChange(null)}>전체</Chip>
            {months.map(ym => (
              <Chip key={ym} selected={month === ym} onClick={() => onMonthChange(month === ym ? null : ym)}>
                {monthLabel(ym)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs text-zinc-400 mb-2">정렬</p>
        <Segmented
          ariaLabel="정렬 기준"
          value={sort}
          onChange={onSortChange}
          options={[
            { value: 'date',   label: '날짜순' },
            { value: 'newest', label: '최신순' },
          ]}
        />
      </div>

      <div className="border-t border-line pt-1">
        <Switch
          id="filter-hide-soldout"
          checked={hideSoldout}
          onChange={onHideSoldoutChange}
          label="매진된 행사 숨기기"
        />
        {/* 카드 크기는 좁은 화면에서만 의미가 있다 — PC는 화면이 넓어서 항상 3~4열이다 */}
        <div className="lg:hidden">
          <Switch
            id="filter-large-cards"
            checked={columns === 1}
            onChange={on => onColumnsChange(on ? 1 : 2)}
            label="카드 크게 보기"
          />
        </div>
      </div>
    </Sheet>
  )
}
