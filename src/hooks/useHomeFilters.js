import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
  search: '',
  sort: 'date', // 'date' | 'newest'
  month: null,  // null = 전체, 'YYYY-MM' = 해당 월
})

export function useHomeFilters() {
  const [filters, setFilters] = useHomeFiltersStore()

  return {
    status:      filters.status      ?? STATUS.UPCOMING,
    category:    filters.category    ?? null,
    hideSoldout: filters.hideSoldout ?? false,
    search:      filters.search      ?? '',
    sort:        filters.sort        ?? 'date',
    // 월 필터는 'YYYY-MM' 문자열로 바뀌었다 — 예전 버전에서 저장된 숫자(9 등)가
    // 남아 있으면 무시하고 "전체"로 시작한다.
    month:       typeof filters.month === 'string' ? filters.month : null,
    setStatus:      status   => setFilters({ ...filters, status, month: null }),
    setCategory:    category => setFilters({ ...filters, category }),
    setHideSoldout: hideSoldout => setFilters({ ...filters, hideSoldout }),
    setSearch:      search      => setFilters({ ...filters, search }),
    setSort:        sort        => setFilters({ ...filters, sort }),
    setMonth:       month       => setFilters({ ...filters, month }),
  }
}
