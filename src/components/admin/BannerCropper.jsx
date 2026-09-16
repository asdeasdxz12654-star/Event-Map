import { useCallback, useRef, useState } from 'react'
import Icon from '../icons'
import { adminApi } from '../../lib/adminApi'
import { useUIFeedback } from '../../contexts/UIFeedbackContext'
import { FOCUS_RING } from '../ui/focusRing'
import { ADMIN_INPUT as input } from '../ui/formStyles'
import { splitBoothName, formatPrice } from '../../lib/boothKinds'
import {
  cropToBlob, findBands, rectFromPoints, sampleGray, toSourceRect, toSourceRects,
} from '../../lib/imageSlice'

// 긴 배너에서 굿즈 사진을 잘라 붙이는 도구.
//
// 왜 이게 필요한가
//   공식은 굿즈를 낱장 사진으로 공개하지 않는다. 원신 굿즈 안내는 1200x42,500px짜리
//   세로 이미지 한 장이고, 젠레스는 1920x1080 슬라이드 아홉 장이다. 지금 ImageField는
//   "이미 잘려 있는 파일"만 받으므로, 굿즈 하나를 넣으려면 포토샵을 열어 자르고 저장한
//   뒤 올려야 했다. 76개면 그 일을 76번 한다 — 그래서 아무도 안 했고 사진이 0장이다.
//
// 원본을 서버에 올리지 않는다
//   파일을 그대로 createImageBitmap으로 읽으면 CORS가 아예 없다. 저장소에 올린 뒤
//   <img>로 불러와 자르면 캔버스가 오염돼 toBlob이 막힐 수 있고, 쓰지도 않을 42,500px
//   원본이 저장소에 영구히 남는다.
const MAX_DISPLAY_WIDTH = 720

export default function BannerCropper({ items, booths }) {
  const { toast } = useUIFeedback()
  const fileRef = useRef(null)
  const imgRef = useRef(null)
  const bitmapRef = useRef(null)

  const [src, setSrc] = useState(null)          // 화면에 띄울 object URL
  const [size, setSize] = useState(null)        // 원본 크기 { width, height }
  const [candidates, setCandidates] = useState([])
  const [rect, setRect] = useState(null)        // 화면 좌표 기준 선택 영역
  const [drag, setDrag] = useState(null)
  const [preview, setPreview] = useState(null)
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)

  // 사진이 없는 굿즈를 위로. 지금 채워야 할 것이 먼저 보여야 한다.
  const goods = items
    .filter(i => i.kind === 'goods')
    .sort((a, b) => Number(!!a.imageUrl) - Number(!!b.imageUrl) || a.name.localeCompare(b.name))
  const boothName = id => splitBoothName(booths.find(b => b.id === id)?.name ?? '').main

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    reset()
    setBusy(true)
    try {
      const bitmap = await createImageBitmap(file)
      bitmapRef.current = bitmap
      setSize({ width: bitmap.width, height: bitmap.height })
      setSrc(URL.createObjectURL(file))

      // 여백 줄로 조각 후보를 찾는다. 배경이 풀블리드면 아무것도 못 찾는데,
      // 그건 실패가 아니라 "직접 드래그하세요"라는 뜻이다.
      const { gray, width, height } = sampleGray(bitmap)
      const bands = findBands(gray, width, height)
      setCandidates(toSourceRects(bands, { sampleHeight: height, width: bitmap.width, height: bitmap.height }))
    } catch (err) {
      toast(`이미지를 읽지 못했습니다: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    bitmapRef.current?.close?.()
    bitmapRef.current = null
    if (src) URL.revokeObjectURL(src)
    setSrc(null); setSize(null); setCandidates([]); setRect(null); setDrag(null); setPreview(null)
  }

  // 화면 좌표(표시된 이미지 기준) -> 원본 좌표 -> 잘라낸 미리보기
  const makePreview = useCallback(async (displayRect) => {
    const bitmap = bitmapRef.current
    const el = imgRef.current
    if (!bitmap || !el || displayRect.width < 4 || displayRect.height < 4) return
    const source = toSourceRect(displayRect, {
      displayWidth: el.clientWidth,
      width: bitmap.width,
      height: bitmap.height,
    })
    const blob = await cropToBlob(bitmap, source)
    setPreview(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return blob ? { blob, url: URL.createObjectURL(blob), source } : null
    })
  }, [])

  const pointAt = (e) => {
    const box = imgRef.current.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const onPointerDown = (e) => {
    if (busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pointAt(e)
    setDrag({ from: p, to: p })
    setRect(null)
  }

  const onPointerMove = (e) => {
    if (!drag) return
    setDrag(d => ({ ...d, to: pointAt(e) }))
  }

  const onPointerUp = () => {
    if (!drag) return
    const r = rectFromPoints(drag.from, drag.to)
    setDrag(null)
    if (r.width < 4 || r.height < 4) return
    setRect(r)
    makePreview(r)
  }

  // 후보를 눌렀을 때 — 후보는 원본 좌표라 화면 좌표로 되돌려 표시한다.
  const chooseCandidate = (c) => {
    const el = imgRef.current
    if (!el) return
    const scale = el.clientWidth / size.width
    setRect({ left: 0, top: c.top * scale, width: el.clientWidth, height: c.height * scale })
    setPreview(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return null })
    cropToBlob(bitmapRef.current, c).then(blob => {
      setPreview(blob ? { blob, url: URL.createObjectURL(blob), source: c } : null)
    })
  }

  const attach = async () => {
    if (!preview || !targetId) return
    setBusy(true)
    try {
      const url = await adminApi.uploadImage(preview.blob, 'items')
      await adminApi.updateBoothItem(targetId, { image_url: url })
      toast('굿즈에 사진을 붙였습니다.', { type: 'success' })
      // 다음 굿즈로 넘어가기 좋게 선택만 비운다 — 원본과 후보는 그대로 둔다.
      setTargetId('')
      setRect(null)
      setPreview(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return null })
    } catch (err) {
      toast(`붙이기 실패: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const live = drag ? rectFromPoints(drag.from, drag.to) : rect
  const withPhoto = goods.filter(g => g.imageUrl).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-zinc-300 leading-relaxed mb-1">
          공식 공지가 굿즈를 긴 이미지 한 장으로만 올리는 경우가 많습니다.
          여기서 필요한 부분만 잘라 굿즈에 바로 붙입니다.
        </p>
        <p className="text-xs text-zinc-500">
          고른 이미지는 서버에 올라가지 않습니다 — 잘라낸 조각만 저장됩니다.
          {goods.length > 0 && (
            <span className="ml-1 tabular-nums">
              · 굿즈 {goods.length}개 중 사진 있는 것 {withPhoto}개
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors ${FOCUS_RING}`}
        >
          <Icon name="image" className="w-3.5 h-3.5" />
          {src ? '다른 이미지 고르기' : '긴 이미지 고르기'}
        </button>
        {src && (
          <>
            <button type="button" onClick={reset}
              className={`text-xs text-zinc-400 hover:text-ink px-2 py-2 rounded-lg ${FOCUS_RING}`}>
              닫기
            </button>
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {size.width} × {size.height}px
              {candidates.length > 0
                ? ` · 조각 후보 ${candidates.length}개`
                : ' · 후보를 못 찾았습니다 (직접 끌어서 지정하세요)'}
            </span>
          </>
        )}
      </div>

      {goods.length === 0 && (
        <p className="text-xs text-warn bg-warn/10 border border-warn/25 rounded-xl px-3.5 py-2.5">
          이 행사에 굿즈가 아직 없습니다. 굿즈 탭에서 상품을 먼저 넣은 뒤 사진을 붙이세요.
        </p>
      )}

      {src && (
        <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-4 lg:items-start">
          {/* 긴 이미지 — 높이가 수만 px이라 세로로만 스크롤시킨다 */}
          <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden border border-line rounded-xl bg-surface-1">
            <div className="relative select-none" style={{ maxWidth: MAX_DISPLAY_WIDTH }}>
              <img
                ref={imgRef}
                src={src}
                alt="잘라낼 원본"
                draggable={false}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="w-full block cursor-crosshair touch-none"
              />
              {/* 자동으로 찾은 후보 */}
              {size && candidates.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => chooseCandidate(c)}
                  aria-label={`조각 후보 ${i + 1} 선택`}
                  style={{
                    top: `${(c.top / size.height) * 100}%`,
                    height: `${(c.height / size.height) * 100}%`,
                  }}
                  className="absolute inset-x-0 border border-dashed border-indigo-400/50 hover:border-indigo-400 hover:bg-indigo-400/10 transition-colors"
                />
              ))}
              {/* 지금 잡은 영역 */}
              {live && (
                <div
                  aria-hidden="true"
                  style={{ left: live.left, top: live.top, width: live.width, height: live.height }}
                  className="absolute border-2 border-indigo-400 bg-indigo-400/15 pointer-events-none"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-3 lg:mt-0 lg:sticky lg:top-20">
            <p className="text-xs font-semibold text-ink">잘라낸 조각</p>
            <div className="aspect-square w-full border border-line rounded-xl overflow-hidden bg-surface-2 grid place-items-center">
              {preview
                ? <img src={preview.url} alt="잘라낸 미리보기" className="w-full h-full object-contain" />
                : <span className="text-[11px] text-zinc-500 px-3 text-center">
                    후보를 누르거나 이미지 위에서 끌어 보세요
                  </span>}
            </div>
            {preview && (
              <p className="text-[11px] text-zinc-500 tabular-nums">
                {preview.source.width} × {preview.source.height}px · {(preview.blob.size / 1024).toFixed(0)}KB
              </p>
            )}

            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              aria-label="사진을 붙일 굿즈"
              className={`${input} w-full py-2`}
            >
              <option value="">어느 굿즈에 붙일까요?</option>
              {goods.map(g => (
                <option key={g.id} value={g.id}>
                  {g.imageUrl ? '● ' : '○ '}
                  {g.name}
                  {g.boothId ? ` — ${boothName(g.boothId)}` : ''}
                  {formatPrice(g.price, g.priceNote) ? ` (${formatPrice(g.price, g.priceNote)})` : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={attach}
              disabled={busy || !preview || !targetId}
              className={`w-full py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors ${FOCUS_RING}`}
            >
              {busy ? '올리는 중...' : '잘라서 붙이기'}
            </button>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              ● 는 이미 사진이 있는 굿즈입니다. 붙이면 기존 사진을 대체합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
