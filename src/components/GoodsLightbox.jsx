import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { boothHue, boothInitial, formatPrice, splitBoothName } from '../lib/boothKinds'

const STATUS_LABEL = { soldout: '품절', limited: '수량 한정', preorder: '예약 판매' }

// 굿즈 하나를 크게 보는 화면.
//
// 굿즈는 생김새가 곧 구매 결정이다. 목록에서는 작게 보여줄 수밖에 없으니, 눌렀을 때
// 사진을 화면 가득 띄우고 가격·설명·파는 곳을 함께 붙인다.
// 좌우로 넘겨 다음 굿즈로 갈 수 있다 — 하나 보고 닫고 또 누르는 걸 반복하지 않도록.
export default function GoodsLightbox({ items, index, booths, onIndexChange, onClose, onJump }) {
  const item = items[index]

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % items.length)
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + items.length) % items.length)
    }
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [index, items.length, onClose, onIndexChange])

  if (!item) return null

  const booth = booths.find(b => b.id === item.boothId)
  const hue = boothHue(booth?.name ?? item.name)
  const price = formatPrice(item.price, item.priceNote)

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/90 flex flex-col animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-3 shrink-0">
        <span className="text-xs text-white/60 tabular-nums">{index + 1} / {items.length}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          autoFocus
          className={`w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors ${FOCUS_RING}`}
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3" onClick={e => e.stopPropagation()}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="max-w-full max-h-full object-contain rounded-xl" />
        ) : (
          <div
            className="w-56 h-56 max-w-full rounded-xl grid place-items-center text-4xl font-bold text-white/90"
            style={{ background: `linear-gradient(140deg, hsl(${hue} 45% 42%), hsl(${(hue + 28) % 360} 40% 26%))` }}
            aria-hidden="true"
          >
            {boothInitial(item.name)}
          </div>
        )}
      </div>

      <div
        className="shrink-0 bg-panel border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h2 className="text-base font-semibold text-ink leading-snug">{item.name}</h2>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % items.length)}
              aria-label="다음 굿즈"
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 text-zinc-300 hover:text-ink transition-colors ${FOCUS_RING}`}
            >
              <Icon name="chevronRight" className="w-4 h-4" />
            </button>
          </div>

          <p className="text-lg font-bold text-ink tabular-nums mb-1">
            {price ?? <span className="text-sm font-normal text-zinc-400">가격 미공개</span>}
            {item.status && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-danger/15 text-danger align-middle">
                {STATUS_LABEL[item.status]}
              </span>
            )}
          </p>

          {item.note && <p className="text-xs text-zinc-400 leading-relaxed mb-2.5">{item.note}</p>}

          {booth && (
            <button
              type="button"
              onClick={() => { onClose(); onJump?.('booths', booth.id) }}
              className={`inline-flex items-center gap-1.5 text-xs text-zinc-300 bg-surface-2 px-2.5 py-1.5 rounded-lg hover:text-ink transition-colors ${FOCUS_RING}`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(${hue} 45% 55%)` }} aria-hidden="true" />
              {splitBoothName(booth.name).main}
              {booth.boothNo && <span className="text-zinc-500 tabular-nums">· {booth.boothNo}</span>}
              <Icon name="chevronRight" className="w-3 h-3 opacity-60" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
