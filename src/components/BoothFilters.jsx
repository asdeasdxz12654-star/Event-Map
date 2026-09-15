import { useEffect, useRef, useState } from 'react'
import Icon from './icons'
import Chip from './ui/Chip'
import Segmented from './ui/Segmented'
import { FOCUS_RING } from './ui/focusRing'
import { OPERATORS, operatorLabel } from '../lib/boothKinds'

// 부스 탭의 필터.
//
// 세 가지가 전부 "있을 때만" 나타난다. 호요랜드처럼 부스 8개가 전부 기업 부스인 행사에는
// 아무것도 안 뜨고, 코믹월드처럼 창작자 부스가 수천 개인 행사에서는 셋 다 뜬다.
// 화면이 데이터 규모를 따라가게 해서, 관리자가 켜고 끌 것이 없다.
const SEARCH_THRESHOLD = 20

export default function BoothFilters({
  booths,
  operator, onOperatorChange,
  hall, onHallChange,
  search, onSearchChange,
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef(null)
  const showSearch = searchOpen || !!search

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  // 세그먼트는 실제로 존재하는 주체만, 그리고 두 종류 이상일 때만 만든다.
  const presentOperators = OPERATORS.filter(o => booths.some(b => b.operator === o.id))
  const showOperators = presentOperators.length > 1

  const byOperator = operator ? booths.filter(b => b.operator === operator) : booths

  // 구역 칩도 마찬가지 — 값이 두 종류 이상일 때만 고를 의미가 있다.
  const halls = [...new Set(byOperator.map(b => b.hall).filter(Boolean))].sort()
  const showHalls = halls.length > 1

  const showSearchToggle = booths.length > SEARCH_THRESHOLD

  if (!showOperators && !showHalls && !showSearchToggle) return null

  return (
    <div className="flex flex-col gap-2 mb-3">
      {showOperators && (
        <Segmented
          className="sm:max-w-md"
          ariaLabel="부스 운영 주체"
          value={operator}
          onChange={onOperatorChange}
          options={[
            { value: null, label: '전체', count: booths.length },
            ...presentOperators.map(o => ({
              value: o.id,
              label: o.label,
              count: booths.filter(b => b.operator === o.id).length,
            })),
          ]}
        />
      )}

      {(showHalls || showSearchToggle) && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0 py-0.5">
            {showHalls && (
              <>
                <Chip selected={hall === null} onClick={() => onHallChange(null)}>전체 구역</Chip>
                {halls.map(h => (
                  <Chip key={h} selected={hall === h} onClick={() => onHallChange(hall === h ? null : h)}>
                    {h}
                  </Chip>
                ))}
              </>
            )}
          </div>

          {showSearchToggle && !showSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="부스 검색"
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-line-strong text-zinc-400 hover:text-ink transition-colors ${FOCUS_RING}`}
            >
              <Icon name="search" className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      )}

      {showSearchToggle && showSearch && (
        <div className="relative">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={operator === 'creator' ? '서클명·부스번호로 찾기' : '부스명·번호 검색'}
            className={`w-full bg-surface-1 border border-line focus:border-indigo-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-ink placeholder:text-zinc-500 transition-colors ${FOCUS_RING}`}
          />
          <button
            type="button"
            onClick={() => { onSearchChange(''); setSearchOpen(false) }}
            aria-label="검색 닫기"
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-ink transition-colors ${FOCUS_RING}`}
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// 이름·부스번호·장르를 함께 훑는다. 수천 개 목록에서 유일하게 쓸모 있는 조작이라
// 조건을 좁게 잡지 않는다 — "A-12"로도, "달빛"으로도, "일러스트"로도 찾힌다.
export function filterBooths(booths, { operator, hall, search }) {
  const q = search?.trim().toLowerCase()
  return booths.filter(b => {
    if (operator && b.operator !== operator) return false
    if (hall && b.hall !== hall) return false
    if (!q) return true
    return [b.name, b.boothNo, b.genre, operatorLabel(b.operator)]
      .filter(Boolean)
      .some(v => v.toLowerCase().includes(q))
  })
}
