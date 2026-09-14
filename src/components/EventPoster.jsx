import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './icons'
import PosterImage from './PosterImage'
import { FOCUS_RING } from './ui/focusRing'
import { categoryMeta } from '../data/events'

// 상세 화면의 포스터.
//
// 예전엔 높이가 h-[360px] sm:h-[440px] lg:h-[480px]로 고정돼 있었다. 뒤로가기 링크까지
// 더하면 모바일 첫 화면을 포스터가 통째로 먹어서, 행사 이름조차 스크롤해야 보였다.
// 포스터를 잘리지 않게 보여주려는 의도(PosterImage 주석 참고)는 맞지만, 그 대가로
// "언제·어디서·얼마"가 화면 밖으로 밀려나 있었다.
//
// 그래서 좁은 화면에서는 화면 높이의 38%까지만 쓰고, 대신 눌러서 전체를 크게 볼 수
// 있게 했다. 넓은 화면에서는 왼쪽 기둥에 들어가므로 원래 비율(3:4)을 그대로 쓴다.
export default function EventPoster({ event, className = '' }) {
  const [imgError, setImgError] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const showPoster = !!event.posterUrl && !imgError

  useEffect(() => {
    // 다른 행사로 이동해도 이 컴포넌트는 언마운트되지 않을 수 있다(같은 라우트, id만 바뀜).
    setImgError(false)
    setZoomed(false)
  }, [event.id])

  useEffect(() => {
    if (!zoomed) return
    const onKey = e => { if (e.key === 'Escape') setZoomed(false) }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [zoomed])

  if (!showPoster) {
    return (
      <div className={`w-full aspect-[3/4] max-h-[38svh] lg:max-h-none rounded-2xl border border-line bg-gradient-to-br from-indigo-900/60 to-violet-900/40 flex flex-col items-center justify-center gap-2 ${className}`}>
        <span className="text-5xl leading-none" aria-hidden="true">{categoryMeta(event.category).emoji}</span>
        <span className="text-sm text-zinc-300">공식 포스터 미정</span>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label="포스터 전체 보기"
        className={`group relative block w-full rounded-2xl overflow-hidden ${FOCUS_RING} ${className}`}
      >
        <PosterImage
          src={event.posterUrl}
          alt={`${event.title} 포스터`}
          onError={() => setImgError(true)}
          className="w-full aspect-[3/4] max-h-[38svh] lg:max-h-none border border-line rounded-2xl"
        />
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/65 backdrop-blur border border-white/15 text-white text-[11px]">
          <Icon name="expand" className="w-3 h-3" />
          전체 보기
        </span>
      </button>

      {zoomed && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${event.title} 포스터`}
        >
          <img
            src={event.posterUrl}
            alt={`${event.title} 포스터`}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="닫기"
            autoFocus
            className={`absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors ${FOCUS_RING}`}
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
