import { useEffect, useRef, useState } from 'react'
import Icon from './icons'
import Chip from './ui/Chip'
import Segmented from './ui/Segmented'
import { FOCUS_RING } from './ui/focusRing'
import { STATUS, CATEGORIES, categoryMeta } from '../data/events'

const STATUS_OPTIONS = [
  { value: STATUS.UPCOMING, label: '예정' },
  { value: STATUS.ONGOING,  label: '진행중' },
  { value: STATUS.ENDED,    label: '종료' },
]

const CATEGORY_FILTERS = [
  { key: null,               label: '전체' },
  { key: CATEGORIES.GAME,    label: '게임전시' },
  { key: CATEGORIES.COSPLAY, label: '코스프레' },
  { key: CATEGORIES.CONCERT, label: '게임음악' },
  { key: CATEGORIES.ILLUST,  label: '일러스트' },
]

// 목록 상단의 상시 컨트롤.
//
// 예전엔 이 자리에 컨트롤이 여섯 종류(상태·검색·카테고리·열 수·정렬·매진) 다섯 줄로
// 쌓여 있었다. 360px 화면에서 세로 260px, 첫 화면의 절반 이상이 필터였고 행사 카드는
// 한 장 반만 보였다. 게다가 여섯 개가 전부 같은 모양·같은 강조색이라 무엇이 주 필터인지
// 구분되지 않았다.
//
// 여기 남는 것은 둘뿐이다 — 상태(세그먼트)와 카테고리(칩).
// 나머지는 FilterSheet로 접고, 검색은 누르면 펼쳐지는 한 줄로 바꿨다.
export default function FilterBar({
  status, onStatusChange, statusCounts,
  category, onCategoryChange,
  search, onSearchChange,
  activeCount, onOpenFilters,
}) {
  // 검색어가 남아 있으면 접지 않는다 — 접어버리면 왜 목록이 걸러져 있는지 알 수 없다.
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef(null)
  const showSearch = searchOpen || !!search

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  const closeSearch = () => {
    onSearchChange('')
    setSearchOpen(false)
  }

  return (
    <div className="flex flex-col gap-2 mb-3">
      {/* 넓은 화면에서 폭을 풀어두면 세 칸이 400px씩 벌어져 "고르는 것"으로 안 보인다 */}
      <Segmented
        className="sm:max-w-md"
        ariaLabel="행사 상태"
        value={status}
        onChange={onStatusChange}
        options={STATUS_OPTIONS.map(o => ({ ...o, count: statusCounts[o.value] }))}
      />

      <div className="flex items-center gap-2">
        {/* 카테고리 — 좁은 화면에서는 이 줄 안에서만 가로로 스크롤된다(페이지는 안 밀리게) */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0 py-0.5">
          {CATEGORY_FILTERS.map(({ key, label }) => (
            <Chip
              key={String(key)}
              selected={category === key}
              dotColor={key ? categoryMeta(key).dotClass : null}
              onClick={() => onCategoryChange(key)}
            >
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!showSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="행사 검색"
              className={`w-9 h-9 flex items-center justify-center rounded-xl border border-line-strong text-zinc-400 hover:text-ink transition-colors ${FOCUS_RING}`}
            >
              <Icon name="search" className="w-[18px] h-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={activeCount > 0 ? `필터 (${activeCount}개 적용됨)` : '필터'}
            className={`h-9 px-3 flex items-center gap-1.5 rounded-xl border text-sm font-medium transition-colors ${FOCUS_RING} ${
              activeCount > 0
                ? 'border-indigo-500/50 bg-indigo-600/15 text-indigo-300'
                : 'border-line-strong text-zinc-400 hover:text-ink'
            }`}
          >
            <Icon name="sliders" className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline">필터</span>
            {activeCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="relative">
          <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="행사명, 장소, 주최사 검색"
            className={`w-full bg-surface-1 border border-line focus:border-indigo-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-ink placeholder:text-zinc-500 transition-colors ${FOCUS_RING}`}
          />
          <button
            type="button"
            onClick={closeSearch}
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
