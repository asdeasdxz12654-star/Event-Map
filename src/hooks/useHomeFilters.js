import { createLocalStorageHook } from './useLocalStorage'
import { STATUS } from '../data/events'

// 홈 화면에서 마지막으로 고른 상태/카테고리 필터를 기억해뒀다가 다음 방문 때 그대로 복원한다.
const useHomeFiltersStore = createLocalStorageHook('gameEventHub.homeFilters', {
  status: STATUS.UPCOMING,
  category: null,
  hideSoldout: false,
})

export function useHomeFilters() {
  const [filters, setFilters] = useHomeFiltersStore()

  function setStatus(status) {
    setFilters({ ...filters, status })
  }

  function setCategory(category) {
    setFilters({ ...filters, category })
  }

  function setHideSoldout(hideSoldout) {
    setFilters({ ...filters, hideSoldout })
  }

  return {
    status: filters.status,
    category: filters.category,
    hideSoldout: filters.hideSoldout ?? false,
    setStatus,
    setCategory,
    setHideSoldout,
  }
}
