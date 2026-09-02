import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
  search: '',
  sort: 'date', // 'date' | 'newest'
})

export function useHomeFilters() {
  const [filters, setFilters] = useHomeFiltersStore()

  return {
    status:      filters.status      ?? STATUS.UPCOMING,
    category:    filters.category    ?? null,
    hideSoldout: filters.hideSoldout ?? false,
    search:      filters.search      ?? '',
    sort:        filters.sort        ?? 'date',
    setStatus:      status      => setFilters({ ...filters, status }),
    setCategory:    category    => setFilters({ ...filters, category }),
    setHideSoldout: hideSoldout => setFilters({ ...filters, hideSoldout }),
    setSearch:      search      => setFilters({ ...filters, search }),
    setSort:        sort        => setFilters({ ...filters, sort }),
  }
}
