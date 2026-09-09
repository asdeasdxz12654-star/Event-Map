import { createLocalStorageHook } from './useLocalStorage'

// 목록(홈·북마크)의 열 수 설정. 모바일에서만 의미가 있다 — PC는 화면이 넓어서
// 항상 3~4열로 보여주고, 좁은 화면에서만 1열(크게)/2열(많이)을 사용자가 고른다.
const useColumnsStore = createLocalStorageHook('gameEventHub.listColumns', 2)

export function useListColumns() {
  const [stored, setStored] = useColumnsStore()
  return [stored === 1 ? 1 : 2, setStored]
}

// Tailwind는 소스를 정적으로 훑어서 클래스를 뽑기 때문에 문자열을 조립하면 안 되고,
// 완성된 클래스명을 그대로 적어야 한다.
export function eventGridClass(columns) {
  const mobile = columns === 1 ? 'grid-cols-1' : 'grid-cols-2'
  return `grid ${mobile} lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6`
}
