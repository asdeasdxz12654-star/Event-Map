import { useEffect } from 'react'

const SITE_NAME = '게임이벤트허브'

// 지금까지 모든 페이지의 브라우저 탭 제목이 "게임이벤트허브"로 고정이었다 —
// 행사 상세로 들어가도 탭/북마크/방문기록에 어떤 행사인지 전혀 안 남았다.
// title이 없으면(로딩 중 등) 사이트명만 보여준다.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME
    return () => {
      document.title = SITE_NAME
    }
  }, [title])
}
