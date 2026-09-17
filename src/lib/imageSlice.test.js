import { describe, expect, it } from 'vitest'
import { clamp, findBands, rectFromPoints, toSourceRect, toSourceRects } from './imageSlice'

// 긴 배너에서 굿즈 사진을 잘라내는 좌표 계산.
//
// 여기가 틀리면 "엉뚱한 부분이 잘린 사진"이 굿즈에 붙는데, 그게 붙고 나서야 알게 된다.
// 브라우저 없이 확인할 수 있게 캔버스를 안 쓰는 함수들만 따로 떼어놨다.

// 줄인 회색조 이미지를 흉내낸다: 패널 구간은 명암 폭이 크고, 여백은 균일하다.
function fakeGray({ width = 120, panels, gap, panelH, top = 5 }) {
  const height = top + panels * (panelH + gap)
  const gray = new Uint8ClampedArray(width * height)
  gray.fill(250) // 흰 여백
  for (let n = 0; n < panels; n++) {
    const y0 = top + n * (panelH + gap)
    for (let y = y0; y < y0 + panelH; y++) {
      for (let x = 0; x < width; x++) gray[y * width + x] = x < width / 2 ? 30 : 200
    }
  }
  return { gray, width, height }
}

describe('findBands — 여백 줄로 조각 나누기', () => {
  it('패널 24개를 24개로 나눈다', () => {
    const { gray, width, height } = fakeGray({ panels: 24, gap: 6, panelH: 20 })
    expect(findBands(gray, width, height)).toHaveLength(24)
  })

  it('패널 2개', () => {
    const { gray, width, height } = fakeGray({ panels: 2, gap: 8, panelH: 40 })
    expect(findBands(gray, width, height)).toHaveLength(2)
  })

  it('조각이 하나뿐이면 "못 찾음"으로 본다', () => {
    // 이미지 전체를 후보로 내밀면 사람이 그걸 지우는 수고가 더 든다.
    const { gray, width, height } = fakeGray({ panels: 1, gap: 8, panelH: 40 })
    expect(findBands(gray, width, height)).toEqual([])
  })

  it('여백이 전혀 없는 이미지(풀블리드 배경)에서 안 터지고 빈 배열', () => {
    const gray = new Uint8ClampedArray(120 * 500)
    for (let i = 0; i < gray.length; i++) gray[i] = i % 120 < 60 ? 20 : 220
    expect(findBands(gray, 120, 500)).toEqual([])
  })

  it('완전히 균일한 이미지도 빈 배열', () => {
    expect(findBands(new Uint8ClampedArray(120 * 300).fill(128), 120, 300)).toEqual([])
  })
})

describe('toSourceRects — 줄인 좌표를 원본으로', () => {
  it('원본 범위를 넘지 않는다', () => {
    const { gray, width, height } = fakeGray({ panels: 3, gap: 6, panelH: 20 })
    const rects = toSourceRects(findBands(gray, width, height), {
      sampleHeight: height, width: 1200, height: 42500,
    })
    expect(rects).toHaveLength(3)
    for (const r of rects) {
      expect(r.top).toBeGreaterThanOrEqual(0)
      expect(r.top + r.height).toBeLessThanOrEqual(42500)
      expect(r.width).toBe(1200)
    }
  })

  it('찾은 경계보다 조금 넓게 잡는다 (딱 붙여 자르면 테두리가 깎인다)', () => {
    const rects = toSourceRects([[10, 20]], { sampleHeight: 100, width: 1000, height: 10000 })
    // 여백 없이 자르면 y 1000~2000. 여유가 붙어 그보다 넓어야 한다.
    expect(rects[0].top).toBeLessThan(1000)
    expect(rects[0].top + rects[0].height).toBeGreaterThan(2000)
  })
})

describe('toSourceRect — 화면에서 끈 사각형을 원본으로', () => {
  const size = { displayWidth: 600, width: 1200, height: 42500 }

  it('화면 폭과 원본 폭의 비율만큼 키운다', () => {
    expect(toSourceRect({ left: 100, top: 40, width: 200, height: 60 }, size))
      .toEqual({ left: 200, top: 80, width: 400, height: 120 })
  })

  it('화면 밖으로 끌어도 원본 범위를 안 넘는다', () => {
    const r = toSourceRect({ left: 590, top: 0, width: 200, height: 50 }, size)
    expect(r.left + r.width).toBeLessThanOrEqual(1200)
  })

  it('폭·높이는 최소 1이다 (0이면 캔버스가 터진다)', () => {
    const r = toSourceRect({ left: 0, top: 0, width: 0, height: 0 }, size)
    expect(r.width).toBeGreaterThanOrEqual(1)
    expect(r.height).toBeGreaterThanOrEqual(1)
  })
})

describe('rectFromPoints', () => {
  it('어느 방향으로 끌어도 같은 사각형이 나온다', () => {
    const a = rectFromPoints({ x: 300, y: 100 }, { x: 100, y: 40 })
    const b = rectFromPoints({ x: 100, y: 40 }, { x: 300, y: 100 })
    expect(a).toEqual(b)
    expect(a).toEqual({ left: 100, top: 40, width: 200, height: 60 })
  })
})

describe('clamp', () => {
  it('범위 안팎을 가른다', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})
