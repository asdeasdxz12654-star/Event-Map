import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './icons'
import SectionCard from './SectionCard'
import DisclosureNote from './DisclosureNote'
import { FOCUS_RING } from './ui/focusRing'
import { useModalDialog } from '../hooks/useModalDialog'

// 부스 배치도.
//
// 상태가 세 가지다. 예전에는 둘뿐이었고(이미지가 있거나, 아무것도 안 그리거나)
// 그래서 "아직 안 나온 것"과 "원래 안 내는 행사"와 "우리가 아직 확인을 못 한 것"이
// 화면에서 전부 똑같이 빈자리로 보였다.
//
//   floorPlanUrl 있음 → 이미지. 눌러서 크게 본다.
//   없고 note 있음    → 언제 어디에 올라오는지 안내 (또는 "미공개")
//   둘 다 없음        → 아무것도 그리지 않는다. 확인 못 한 것을 단정하지 않는다.
//
// 배치도는 포스터와 달리 "확대해서 부스 번호를 읽는" 그림이다(코믹월드 안내문도
// "배치도를 확대하면 부스번호가 보입니다"라고 적어둔다). 그래서 카드 안에서는
// 전체를 보여주고, 누르면 원본 크기로 띄워 브라우저 확대에 맡긴다.
export default function FloorPlan({ event }) {
  const [imgError, setImgError] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const url = event.floorPlanUrl
  const showImage = !!url && !imgError

  useEffect(() => {
    setImgError(false)
    setZoomed(false)
  }, [event.id])

  if (!showImage) {
    // 이미지를 못 불러온 경우에도 메모가 있으면 그걸 보여준다 — 빈 카드보다는 낫다.
    if (!event.floorPlanNote) return null
    return (
      <SectionCard title="부스 배치도">
        <DisclosureNote
          note={event.floorPlanNote}
          subject="부스 배치도"
          emptyText="아직 공개되지 않았습니다."
        />
      </SectionCard>
    )
  }

  return (
    <>
      <SectionCard title="부스 배치도">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="부스 배치도 크게 보기"
          className={`group relative block w-full rounded-xl overflow-hidden ${FOCUS_RING}`}
        >
          <img
            src={url}
            alt={`${event.title} 부스 배치도`}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full rounded-xl object-contain bg-surface-2"
          />
          <span className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/65 backdrop-blur border border-white/15 text-white text-[11px]">
            <Icon name="expand" className="w-3 h-3" />
            크게 보기
          </span>
        </button>
      </SectionCard>

      {zoomed && <FloorPlanZoom event={event} url={url} onClose={() => setZoomed(false)} />}
    </>
  )
}

// 크게 보기. 별도 컴포넌트인 이유는 useModalDialog이 "열려 있는 동안"만 살아 있어야
// 하기 때문이다 — 훅은 조건부로 부를 수 없으니, 열릴 때 마운트되는 자리를 따로 만든다.
function FloorPlanZoom({ event, url, onClose }) {
  const panelRef = useRef(null)
  useModalDialog(panelRef, onClose)

  return createPortal(
    <div
      ref={panelRef}
      className="fixed inset-0 z-[80] bg-black/90 overflow-auto animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} 부스 배치도`}
    >
      {/* 원본 크기로 띄우고 확대·스크롤은 브라우저에 맡긴다 — 배치도는 부스 번호를
          읽어야 하는 그림이라 화면에 맞춰 줄이면 쓸모가 없다. */}
      <img
        src={url}
        alt={`${event.title} 부스 배치도`}
        className="max-w-none mx-auto"
        onClick={e => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className={`fixed top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors ${FOCUS_RING}`}
      >
        <Icon name="x" className="w-5 h-5" />
      </button>
    </div>,
    document.body
  )
}
