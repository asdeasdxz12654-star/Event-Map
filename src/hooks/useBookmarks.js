import { createLocalStorageHook } from './useLocalStorage'

const useBookmarkStore = createLocalStorageHook('gameEventHub.bookmarks', [])

export function useBookmarks() {
  const [ids, setIds] = useBookmarkStore()

  function isBookmarked(id) {
    return ids.includes(id)
  }

  function toggleBookmark(id) {
    setIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  return { bookmarkIds: ids, isBookmarked, toggleBookmark }
}
