// PWA 아이콘 생성 스크립트. public/favicon.svg를 배경색 위에 얹어 192/512 PNG로 렌더링한다.
// 실행: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const BG = '#0f0f1a'
const svg = readFileSync(join(root, 'public', 'favicon.svg'))

async function makeIcon(size, fileName, { padding = 0.22 } = {}) {
  const inner = Math.round(size * (1 - padding * 2))
  const mark = await sharp(svg).resize(inner, inner, { fit: 'contain' }).toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(join(outDir, fileName))

  console.log('wrote', fileName)
}

await makeIcon(192, 'icon-192.png')
await makeIcon(512, 'icon-512.png')
// 마스커블 아이콘은 안전 영역을 더 넉넉히 둔다 (Android 적응형 아이콘용)
await makeIcon(512, 'icon-512-maskable.png', { padding: 0.3 })
