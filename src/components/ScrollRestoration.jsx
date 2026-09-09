import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// React Router는 페이지 이동 시 스크롤 위치를 그대로 둔다 — 목록에서 한참 내려가 카드를
// 열면 상세페이지도 같은 위치로 스크롤된 채 열려서 콘텐츠 중간에 뚝 떨어진 것처럼 보인다.
// 그래서 예전엔 경로가 바뀔 때마다 무조건 맨 위로 올렸는데, 그러면 뒤로가기로 목록에
// 돌아왔을 때도 맨 위로 튀어서 보던 자리를 다시 찾아 내려가야 했다.
//
// 지금은 이동 방향으로 구분한다.
//   - 새 화면으로 이동(PUSH/REPLACE) → 맨 위
//   - 뒤로/앞으로(POP)              → 떠날 때 위치로 복원
//
// 복원이 까다로운 이유: 목록 데이터는 비동기로 불러오기 때문에 뒤로 온 직후에는 문서가
// 아직 짧아서 원하는 위치까지 스크롤이 안 된다. 그래서 목표 위치에 닿을 때까지 잠깐
// 재시도한다.
const positions = new Map()
const RESTORE_ATTEMPTS = 12
const RESTORE_INTERVAL_MS = 80

export default function ScrollRestoration() {
  const { key } = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    // 브라우저 자체 복원과 겹치면 서로 덮어써서 위치가 튄다 — 우리가 전담한다.
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0)
      return
    }

    const target = positions.get(key) ?? 0
    if (target === 0) {
      window.scrollTo(0, 0)
      return
    }

    let attempts = 0
    let timer = null
    const tryRestore = () => {
      window.scrollTo(0, target)
      attempts += 1
      // 실제로 그 위치까지 내려갔으면 끝. 아직 문서가 짧으면 조금 뒤 다시 시도.
      if (Math.abs(window.scrollY - target) < 2 || attempts >= RESTORE_ATTEMPTS) return
      timer = setTimeout(tryRestore, RESTORE_INTERVAL_MS)
    }
    tryRestore()

    return () => clearTimeout(timer)
  }, [key, navigationType])

  // 현재 화면의 스크롤 위치를 계속 기록해둔다 (떠날 때 값을 알아야 하므로).
  // 정리 단계에서 한 번 더 기록하지는 않는다 — StrictMode는 이펙트를 두 번 실행하는데,
  // 그때 정리가 "지금 스크롤 위치(=막 복원을 시작해 아직 0)"를 저장해버려서 방금 복원하려던
  // 값을 스스로 덮어썼다. 스크롤 이벤트만으로도 마지막 위치는 이미 기록된다.
  useEffect(() => {
    const remember = () => positions.set(key, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [key])

  return null
}
