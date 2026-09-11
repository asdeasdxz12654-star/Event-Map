import { useEffect, useState } from 'react'

const SHOW_AFTER_PX = 480

// 상세페이지에 부스·출연진·지도 카드가 계속 쌓이면서 스크롤이 길어졌는데,
// 맨 위로 돌아가는 방법이 "직접 쭉 끌어올리기"뿐이었다. 전 페이지 공통으로 하나만
// 마운트해서, 일정 이상 스크롤됐을 때만 나타나는 플로팅 버튼을 둔다.
// bottom-20(모바일)은 EventDetailPage의 하단 고정 예매 바와 안 겹치게 여유를 둔 값.
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="맨 위로 이동"
      className="fixed bottom-20 lg:bottom-6 right-4 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-ink/10 hover:bg-ink/20 backdrop-blur border border-ink/10 text-ink shadow-lg transition-colors"
    >
      ↑
    </button>
  )
}
