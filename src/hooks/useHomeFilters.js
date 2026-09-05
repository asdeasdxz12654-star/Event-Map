import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
  search: '',
  sort: 'date', // 'date' | 'newest'
  month: null,  // null = 전체, 1~12 = 해당 월
})

export function useHomeFilters() {
  const [filters, setFilters] = useHomeFiltersStore()

  return {
    status:      filters.status      ?? STATUS.UPCOMING,
    category:    filters.category    ?? null,
    hideSoldout: filters.hideSoldout ?? false,
    search:      filters.search      ?? '',
    sort:        filters.sort        ?? 'date',
    month:       filters.month       ?? null,
    setStatus:      status   => setFilters({ ...filters, status, month: null }),
    setCategory:    category => setFilters({ ...filters, category }),
    setHideSoldout: hideSoldout => setFilters({ ...filters, hideSoldout }),
    setSearch:      search      => setFilters({ ...filters, search }),
    setSort:        sort        => setFilters({ ...filters, sort }),
    setMonth:       month       => setFilters({ ...filters, month }),
  }
}
