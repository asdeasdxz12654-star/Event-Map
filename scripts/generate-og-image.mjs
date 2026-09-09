// 링크 공유용 OG 이미지(1200x630)를 만든다. public/favicon.svg 마크 + 사이트명.
// 실행: node scripts/generate-og-image.mjs
//
// 예전엔 og:image로 192px 아이콘을 그대로 썼는데, 카카오톡·트위터 미리보기는 그 크기로는
// 썸네일조차 제대로 안 잡아서 링크가 밋밋하게 보였다. 권장 규격인 1200x630으로 만든다.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const WIDTH = 1200
const HEIGHT = 630
const BG = '#0f0f1a'

const mark = await sharp(readFileSync(join(root, 'public', 'favicon.svg')))
  // favicon.svg는 정사각형이 아니라서 contain으로 맞추면 위아래 여백이 생기는데,
  // 배경을 지정하지 않으면 sharp가 검정으로 채워서 어두운 배경 위에 검은 띠가 남는다.
  .resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

// 텍스트는 SVG로 그린다. 한글 폰트는 시스템에 있는 것을 순서대로 시도한다.
const FONTS = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
const textSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#0f0f1a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <circle cx="980" cy="120" r="420" fill="url(#glow)"/>
  <text x="600" y="430" text-anchor="middle" font-family="${FONTS}" font-size="72" font-weight="700" fill="#ffffff">
    게임이벤트허브
  </text>
  <text x="600" y="492" text-anchor="middle" font-family="${FONTS}" font-size="30" fill="#a1a1aa">
    국내 게임 · 코스프레 · 게임음악 행사를 한눈에
  </text>
</svg>`)

await sharp(textSvg)
  .composite([{ input: mark, top: 110, left: Math.round((WIDTH - 240) / 2) }])
  .png()
  .toFile(join(root, 'public', 'og-image.png'))

console.log('wrote public/og-image.png (1200x630)')
