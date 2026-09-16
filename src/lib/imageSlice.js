// 긴 이미지를 조각으로 가르는 규칙과, 그 조각을 잘라내는 일.
//
// 왜 필요한가
//   공식은 굿즈를 낱장 사진으로 공개하지 않는다. 원신 굿즈 안내는 1200x42,500px짜리
//   세로 이미지 한 장이고, 젠레스는 1920x1080 슬라이드 아홉 장이다. 그래서 굿즈 76개에
//   붙일 사진이 한 장도 없었다 — 없어서가 아니라 잘라낼 방법이 없어서다.
//
// 자동으로 찾은 것은 "후보"일 뿐이다
//   여백 줄을 찾아 패널을 가르는 방식은 배경이 흰 공지에서는 잘 맞지만, 풀블리드
//   그라데이션이 깔린 공지에서는 거의 못 찾는다. 그래서 틀려도 손해가 없게 만든다 —
//   후보는 클릭 한 번을 줄여줄 뿐이고, 빗나가면 사람이 그냥 드래그한다.
//   어느 상품인지는 자동으로 정하지 않는다(이 저장소는 이미 한 번 굿즈 가격표를
//   자동 생성했다가 없는 값을 만들어 냈다).

// 가로줄 하나의 "명암 폭". 배경만 있는 줄은 0에 가깝고, 그림이 있으면 커진다.
// 폭 SAMPLE_WIDTH로 줄여서 재기 때문에 42,500px짜리도 한 번에 훑을 수 있다.
const SAMPLE_WIDTH = 120
const GUTTER_CONTRAST = 12   // 이 아래면 여백 줄로 본다
const MIN_BAND_RATIO = 0.01  // 전체 높이의 1% 미만짜리 조각은 버린다(글자 한 줄 등)
const PAD_RATIO = 0.004      // 찾은 경계에 약간 여유를 준다 — 딱 붙여 자르면 테두리가 깎인다

// 줄어든 회색조 픽셀(Uint8ClampedArray, width*height)에서 조각 경계를 찾는다.
//
// 캔버스를 안 받고 픽셀 배열만 받는 이유: 이 함수를 브라우저 없이 node로 돌려
// 확인할 수 있어야 한다. 캔버스에서 픽셀을 꺼내는 일은 호출부가 한다.
export function findBands(gray, width, height) {
  const isGutter = new Array(height)
  for (let y = 0; y < height; y++) {
    let min = 255
    let max = 0
    const row = y * width
    for (let x = 0; x < width; x++) {
      const v = gray[row + x]
      if (v < min) min = v
      if (v > max) max = v
    }
    isGutter[y] = max - min < GUTTER_CONTRAST
  }

  const minBand = Math.max(2, Math.round(height * MIN_BAND_RATIO))
  const bands = []
  let start = null
  for (let y = 0; y <= height; y++) {
    const gutter = y === height ? true : isGutter[y]
    if (!gutter && start === null) start = y
    if (gutter && start !== null) {
      if (y - start >= minBand) bands.push([start, y])
      start = null
    }
  }

  // 여백이 전혀 없는 이미지(풀블리드 배경)에서는 조각이 하나로 나온다. 그건 후보가
  // 아니라 "못 찾았다"는 뜻이므로 빈 배열로 돌려준다 — 이미지 전체를 후보로 내밀면
  // 사람이 그걸 지우는 수고가 더 든다.
  if (bands.length <= 1) return []
  return bands
}

// 줄인 좌표(0..sampleHeight)를 원본 픽셀 좌표로 되돌리고 여유를 준다.
export function toSourceRects(bands, { sampleHeight, width, height }) {
  const scale = height / sampleHeight
  const pad = Math.round(height * PAD_RATIO)
  return bands.map(([a, b]) => {
    const top = Math.max(0, Math.round(a * scale) - pad)
    const bottom = Math.min(height, Math.round(b * scale) + pad)
    return { left: 0, top, width, height: bottom - top }
  })
}

// 화면에 띄운 크기(displayWidth)에서 끌어낸 사각형을 원본 좌표로 옮긴다.
// 드래그는 늘 줄여 보여준 이미지 위에서 일어나므로 이 환산이 필요하다.
export function toSourceRect(dragRect, { displayWidth, width, height }) {
  const scale = width / displayWidth
  const left = clamp(Math.round(dragRect.left * scale), 0, width)
  const top = clamp(Math.round(dragRect.top * scale), 0, height)
  return {
    left,
    top,
    width: clamp(Math.round(dragRect.width * scale), 1, width - left),
    height: clamp(Math.round(dragRect.height * scale), 1, height - top),
  }
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// 드래그 중인 두 점을 정규화된 사각형으로. 어느 방향으로 끌어도 같은 결과가 나온다.
export function rectFromPoints(a, b) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

// --- 아래는 브라우저 전용(캔버스가 필요하다) -------------------------------

// 원본 비트맵을 폭 SAMPLE_WIDTH로 줄여 회색조 픽셀을 꺼낸다.
export function sampleGray(bitmap) {
  const width = SAMPLE_WIDTH
  const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // 사람 눈이 초록에 가장 민감하다 — 표준 휘도 가중치.
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
  }
  return { gray, width, height }
}

// 원본에서 사각형만 잘라 webp Blob으로. 긴 변을 maxWidth로 줄인다
// (ImageField의 shrink와 같은 규칙 — 굿즈 사진은 1200px이다).
export async function cropToBlob(bitmap, rect, maxWidth = 1200) {
  const scale = Math.min(1, maxWidth / rect.width)
  const w = Math.max(1, Math.round(rect.width * scale))
  const h = Math.max(1, Math.round(rect.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, w, h)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
  // webp 인코딩을 못 하는 환경이면 png로 떨어진다. 화질보다 "올라가긴 한다"가 먼저다.
  if (blob) return blob
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}
