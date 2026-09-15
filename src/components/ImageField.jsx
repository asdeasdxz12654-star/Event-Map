import { useRef, useState } from 'react'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { useUIFeedback } from '../contexts/UIFeedbackContext'
import { adminApi } from '../lib/adminApi'

// 이미지 한 칸 — 주소를 붙여넣거나, 파일을 바로 올린다.
//
// 왜 파일 업로드가 필요한가
//   지금까지는 "주소 붙여넣기"뿐이었다. 그런데 실제로 필요한 사진은 공식 공지 안에
//   박혀 있는 경우가 많다 — 호요랜드 굿즈는 1200x42,500px짜리 세로 이미지 한 장,
//   젠레스는 1920x1080 슬라이드 9장이 전부다. 거기서 상품 부분을 잘라낸 파일에는
//   붙여넣을 주소가 없다. 어딘가에 먼저 올려야 했고, 그 단계가 사실상 입력을 막고 있었다.
//
// 브라우저에서 줄여 보낸다
//   Worker에는 이미지 처리 라이브러리가 없다(sharp는 Node 전용). canvas로 줄이면
//   업로드도 가벼워지고, 올라간 파일은 이미 우리 저장소라 사본 워크플로가 다시 건드리지
//   않는다 — 즉 여기서 줄이지 않으면 원본 크기 그대로 영영 남는다.
//
// kind는 image-mirror.mjs의 규칙과 맞춘다. 배치도만 크게 두는 이유는 확대해서 부스
// 번호를 읽는 그림이라 줄이면 못 쓰게 되기 때문이다.
const MAX_WIDTH = { thumb: 800, photo: 1200, plan: 3000 }

export default function ImageField({
  value,
  onChange,
  prefix = 'items',
  kind = 'photo',
  placeholder = '이미지 URL',
  className = '',
  inputClassName = '',
}) {
  const { toast } = useUIFeedback()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    // 같은 파일을 다시 고를 수 있게 값을 비운다 — 안 그러면 두 번째 선택에서
    // change 이벤트가 안 온다.
    e.target.value = ''
    if (!file) return

    setBusy(true)
    try {
      const blob = await shrink(file, MAX_WIDTH[kind] ?? MAX_WIDTH.photo)
      const url = await adminApi.uploadImage(blob, prefix)
      onChange(url)
    } catch (err) {
      toast(`업로드 실패: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {value && (
        // 올린 직후 무엇이 들어갔는지 눈으로 확인할 수 있어야 한다. 주소만 보고는
        // 엉뚱한 파일을 올렸는지 알 수 없다.
        <img
          src={value}
          alt=""
          className="w-8 h-8 rounded-md object-cover border border-line shrink-0"
        />
      )}
      <input
        type="url"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
      />
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title="파일 올리기"
        aria-label="이미지 파일 올리기"
        className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-line text-zinc-400 hover:text-ink disabled:opacity-50 transition-colors ${FOCUS_RING}`}
      >
        {busy ? <span className="text-[10px]">…</span> : <Icon name="download" className="w-3.5 h-3.5 rotate-180" />}
      </button>
    </span>
  )
}

// 긴 변을 maxWidth로 줄이고 webp로 바꾼다.
//
// GIF는 건드리지 않는다 — canvas로 그리면 첫 프레임만 남아 움직임이 사라진다.
// createImageBitmap이나 webp 인코딩을 못 하는 환경에서는 원본을 그대로 올린다.
// 화질보다 "올라가긴 한다"가 먼저다.
async function shrink(file, maxWidth) {
  if (file.type === 'image/gif') return file
  if (typeof createImageBitmap !== 'function') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const scale = Math.min(1, maxWidth / bitmap.width)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
    // 줄였는데 더 커지면(이미 잘 압축된 작은 png 등) 원본이 낫다.
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file
    return blob
  } finally {
    bitmap.close?.()
  }
}
