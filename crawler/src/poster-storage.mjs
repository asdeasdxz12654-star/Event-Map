// 큰 포스터를 줄여서 우리 저장소(Supabase Storage의 posters 버킷)에 두고, 그 주소를 쓴다.
//
// 왜 필요한가
//   주최 측은 인쇄용 원본을 그대로 올려두는 경우가 많다. 실제로 코믹월드 336 포스터가
//   7.0MB, 2026 광주 ACE Fair 포스터가 5.7MB(6968x9921)였고, 홈 첫 화면에서 이미지만
//   10.2MB를 받고 있었다. 목록 카드에서는 300px 안팎으로 보여주는 그림이라 과하다.
//
//   덤으로 두 가지가 더 해결된다.
//   - 핫링크 차단: 어떤 서버는 남의 사이트에서 이미지를 불러오면 401을 준다(인벤이 그렇다).
//     우리 저장소에서 서빙하면 그 문제가 없다.
//   - 원본이 사라져도 카드가 안 깨진다.
//
// 언제 복사하는가
//   원본이 MAX_INLINE_BYTES를 넘을 때만 한다. 작은 포스터까지 전부 복사하면 저장소만
//   불어나고 얻는 게 없다. 이미 우리 저장소에 있는 주소면 그대로 둔다.
//
// 준비물: supabase/storage.sql의 posters 버킷(공개 읽기, 5MB 제한, jpeg/png/webp 허용).
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { UA } from './util.mjs'

const BUCKET = 'posters'
// 이 크기를 넘는 포스터만 줄여서 다시 올린다.
// 처음엔 400KB로 뒀는데, 그러고도 첫 화면이 2.2MB였다 — 300px 남짓으로 보여주는 카드에
// 300KB짜리를 받고 있었다. 1000px webp로 줄이면 대개 40~80KB라, 그보다 큰 원본은
// 줄이는 편이 항상 이득이다.
const MAX_INLINE_BYTES = 150 * 1024
// 카드·상세 어디서도 1000px이면 충분하다(상세 최대 높이가 480px, 2배 해상도 화면 고려).
const TARGET_WIDTH = 1000
const WEBP_QUALITY = 80
// 원본이 이보다 크면 받다가 그만둔다 — 어쩌다 100MB짜리를 만나도 CI가 멈추지 않게.
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024

function isOurStorage(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/')
}

// 파일 이름에 원본 주소의 해시를 붙인다. 포스터가 바뀌면 파일 이름도 바뀌므로 CDN 캐시에
// 옛 이미지가 남는 문제가 없다 (같은 원본이면 같은 이름이라 다시 올려도 덮어쓴다).
function storagePath(eventId, sourceUrl) {
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 8)
  const safeId = String(eventId).replace(/[^a-zA-Z0-9_-]/g, '')
  return `${safeId}-${hash}.webp`
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`이미지가 아님 (${type})`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`너무 큼 (${(declared / 1048576).toFixed(1)}MB)`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('너무 큼')
  return buffer
}

// 포스터를 우리 저장소 사본으로 바꾼다. 바꿀 필요가 없거나 실패하면 null —
// 호출한 쪽은 원본 주소를 그대로 쓰면 된다.
export async function storePoster(supabase, eventId, sourceUrl, { dryRun = false } = {}) {
  if (!eventId || !sourceUrl?.startsWith('http')) return null
  if (isOurStorage(sourceUrl)) return null // 이미 우리 것

  let original
  try {
    original = await download(sourceUrl)
  } catch (err) {
    console.warn(`  -> 포스터 최적화 건너뜀 (원본을 못 받음: ${err.message})`)
    return null
  }

  if (original.byteLength <= MAX_INLINE_BYTES) return null // 그대로 써도 되는 크기

  let resized
  try {
    resized = await sharp(original)
      .rotate() // EXIF 회전 정보 반영
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
  } catch (err) {
    console.warn(`  -> 포스터 최적화 건너뜀 (이미지를 못 읽음: ${err.message})`)
    return null
  }

  // 줄여도 더 커지는 경우(이미 잘 압축된 작은 이미지)는 의미가 없다.
  if (resized.byteLength >= original.byteLength) return null

  const path = storagePath(eventId, sourceUrl)
  const summary = `${(original.byteLength / 1024).toFixed(0)}KB -> ${(resized.byteLength / 1024).toFixed(0)}KB`

  if (dryRun) {
    console.log(`  -> 포스터 최적화 예정: ${summary} (${path})`)
    return null
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, resized, { contentType: 'image/webp', upsert: true })
  if (error) {
    console.warn(`  -> 포스터 최적화 실패 (업로드: ${error.message})`)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) return null
  console.log(`  -> 포스터 최적화: ${summary}`)
  return data.publicUrl
}
