import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
  sort: 'date', // 'date' | 'newest'
  month: null,  // null = 전체, 'YYYY-MM' = 해당 월
})

// 검색어만 sessionStorage에 둔다. 예전엔 다른 필터와 함께 localStorage에 저장돼서,
// "지스타"를 검색해둔 채로 닫으면 며칠 뒤 다시 들어와도 걸러진 목록이 첫 화면이었다.
// 탭 안에서는 유지되므로 상세페이지를 보고 뒤로 와도 검색어는 그대로 남는다.
const useSearchStore = createLocalStorageHook('gameEventHub.homeSearch', '', 'session')

export function useHomeFilters() {
  const [filters, setFilters] = useHomeFiltersStore()
  const [search, setSearch] = useSearchStore()

  return {
    status:      filters.status      ?? STATUS.UPCOMING,
    category:    filters.category    ?? null,
    hideSoldout: filters.hideSoldout ?? false,
    sort:        filters.sort        ?? 'date',
    search:      typeof search === 'string' ? search : '',
    // 월 필터는 'YYYY-MM' 문자열로 바뀌었다 — 예전 버전에서 저장된 숫자(9 등)가
    // 남아 있으면 무시하고 "전체"로 시작한다.
    month:       typeof filters.month === 'string' ? filters.month : null,
    setStatus:      status   => setFilters({ ...filters, status, month: null }),
    setCategory:    category => setFilters({ ...filters, category }),
    setHideSoldout: hideSoldout => setFilters({ ...filters, hideSoldout }),
    setSort:        sort     => setFilters({ ...filters, sort }),
    setMonth:       month    => setFilters({ ...filters, month }),
    setSearch,
  }
}
