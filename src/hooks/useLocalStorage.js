import { useEffect, useState } from 'react'

// key마다 리스너 집합을 분리해서, 같은 key를 구독하는 여러 컴포넌트 인스턴스가
// (한쪽에서 값을 바꾸면 다른 쪽도 즉시 갱신되도록) 상태를 동기화하는 훅을 만든다.
export function createLocalStorageHook(key, defaultValue) {
  const listeners = new Set()

  function read() {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : defaultValue
    } catch {
      return defaultValue
    }
  }

  function write(value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
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
