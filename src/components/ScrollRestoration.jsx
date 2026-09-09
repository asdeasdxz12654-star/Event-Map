import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// React Router는 기본적으로 페이지 이동 시 스크롤 위치를 그대로 유지한다 —
// 홈에서 한참 내려가서 행사 카드를 클릭하면, 상세페이지도 똑같이 스크롤된
// 채로 열려서 사용자가 콘텐츠 중간에 뚝 떨어진 것처럼 보인다. 경로가 바뀔 때마다
// 맨 위로 되돌린다(뒤로가기 등 브라우저 히스토리 이동은 예외 없이 전부 top으로 —
// 브라우저 자체 스크롤 복원과 다소 다르지만, 이 앱은 목록/상세를 오가는 게
// 대부분이라 매번 top이 낫다).
export default function ScrollRestoration() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
