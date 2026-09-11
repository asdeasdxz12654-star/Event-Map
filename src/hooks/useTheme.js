import { useEffect } from 'react'
import { createLocalStorageHook } from './useLocalStorage'

// 화면 색 테마. 기본은 다크고, 설정에서 라이트로 바꿀 수 있다.
//
// 실제 색은 <html data-theme="light">가 붙으면 index.css의 색 토큰이 통째로 바뀌면서
// 적용된다. 여기서는 그 표시를 붙였다 뗐다 하는 것과, 저장·복원만 맡는다.
//
// 저장 키와 기본값은 public/theme-init.js와 짝이다 — 첫 화면이 다크로 깜빡였다가
// 라이트로 바뀌는 걸 막으려고, 그 스크립트가 React보다 먼저 같은 값을 읽어 표시를 붙인다.
// 한쪽만 고치면 깜빡임이 돌아오므로 키를 바꿀 때는 둘 다 고쳐야 한다.
export const THEME_STORAGE_KEY = 'gameEventHub.theme'

const useThemeStore = createLocalStorageHook(THEME_STORAGE_KEY, 'dark')

// meta[name=theme-color](주소창 색)는 건드리지 않는다 — 그건 페이지 배경이 아니라
// 브랜드 색(#6366f1)으로 쓰고 있고, 두 테마 어느 쪽에도 어울린다.
export function applyTheme(theme) {
  // 다크가 기본이라 속성 자체를 지운다 — CSS도 :root를 다크로 두고 있다.
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}

export function useTheme() {
  const [stored, setStored] = useThemeStore()
  const theme = stored === 'light' ? 'light' : 'dark'

  useEffect(() => { applyTheme(theme) }, [theme])

  return [theme, setStored]
}
