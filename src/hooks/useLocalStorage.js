import { useEffect, useState } from 'react'

// key마다 리스너 집합을 분리해서, 같은 key를 구독하는 여러 컴포넌트 인스턴스가
// (한쪽에서 값을 바꾸면 다른 쪽도 즉시 갱신되도록) 상태를 동기화하는 훅을 만든다.
//
// storage: 'local'   — 브라우저를 닫아도 유지 (북마크·필터 설정 등)
//          'session' — 탭을 닫으면 사라짐 (검색어처럼 다음 방문까지 남으면 곤란한 값)
export function createLocalStorageHook(key, defaultValue, storage = 'local') {
  const listeners = new Set()

  function store() {
    return storage === 'session' ? sessionStorage : localStorage
  }

  function read() {
    try {
      const raw = store().getItem(key)
      return raw ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  }

  function write(value) {
    try {
      store().setItem(key, JSON.stringify(value))
    } catch {
      // 저장 실패(시크릿 모드 등)는 무시하고 메모리 상의 상태만 유지한다
    }
    listeners.forEach(notify => notify(value))
  }

  return function useStore() {
    const [value, setValue] = useState(read)

    useEffect(() => {
      listeners.add(setValue)
      return () => listeners.delete(setValue)
    }, [])

    return [value, write]
  }
}
