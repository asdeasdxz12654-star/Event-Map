// 남의 서버에 있는 이미지를 우리 저장소(Supabase Storage) 사본으로 바꾼다.
//
// 포스터는 이미 poster-storage.mjs가 같은 일을 하고 있었다. 그쪽은 "큰 것만 줄인다"가
// 목적이라 150KB 이하는 건드리지 않는데, 부스·굿즈·코스어·배치도 이미지는 목적이 다르다 —
// 크기가 아니라 **원본이 사라지는 것**이 문제다. 공식 공지는 행사가 끝나면 내려가고,
// 그때 화면에 남는 건 깨진 이미지 아이콘뿐이다. 그래서 여기서는 크기와 무관하게 옮긴다.
//
// 다운로드 부분은 poster-storage.mjs와 같아야 해서 이 파일로 옮기고 그쪽이 가져다 쓴다.
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { UA } from './util.mjs'

// 원본이 이보다 크면 받다가 그만둔다 — 어쩌다 100MB짜리를 만나도 CI가 멈추지 않게.
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024

// 우리 저장소(Supabase Storage) 사본인지.
export function isOurStorage(url) {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/')
}

// 바이트만 필요할 때. 포스터 쪽(poster-storage.mjs)이 이 형태로 쓴다.
export async function downloadImage(url) {
  return (await downloadImageTyped(url)).buffer
}

// 바이트 + 서버가 밝힌 실제 형식.
//
// 주소의 확장자는 믿을 수 없다 — .jpg로 끝나는데 서버가 avif를 주는 경우가 흔하다.
// 원본을 그대로 올릴지 판단하려면 진짜 형식을 알아야 한다.
export async function downloadImageTyped(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`이미지가 아님 (${type})`)
  const contentType = type.split(';')[0].trim()
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`너무 큼 (${(declared / 1048576).toFixed(1)}MB)`)

  // 실제로 읽으면서 상한을 넘기면 그 자리에서 끊는다. arrayBuffer()로 전부 받은 뒤에
  // 크기를 재면, Content-Length를 안 주는 서버(청크 전송)에서는 100MB를 다 받고 나서야
  // "너무 큼"이 된다 — 막으려던 상황이 그대로 일어난다.
  const chunks = []
  let received = 0
  for await (const chunk of res.body) {
    received += chunk.byteLength
    if (received > MAX_DOWNLOAD_BYTES) {
      throw new Error(`너무 큼 (${(MAX_DOWNLOAD_BYTES / 1048576).toFixed(0)}MB 초과)`)
    }
    chunks.push(chunk)
  }
  return { buffer: Buffer.concat(chunks.map(c => Buffer.from(c))), contentType }
}

// 이미지 종류별 처리 규칙.
//
// 배치도만 따로 두는 이유: 이건 "확대해서 부스 번호를 읽는" 그림이다. 코믹월드 안내문도
// "배치도를 확대하면 부스번호가 보입니다"라고 적어둔다. 1000px로 줄이면 글자가 뭉개져
// 배치도 구실을 못 하므로, 폭을 크게 잡고 화질도 높인다.
export const IMAGE_KINDS = {
  thumb: { width: 800, quality: 80 },   // 부스 대표 이미지 — 카드에서 44px로 보인다
  photo: { width: 1200, quality: 82 },  // 굿즈·코스어 — 라이트박스에서 크게 본다
  plan: { width: 3000, quality: 88 },   // 배치도 — 확대해서 읽는다
}

// 파일 이름에 원본 주소의 해시를 붙인다. 원본이 바뀌면 이름도 바뀌므로 CDN 캐시에 옛
// 이미지가 남지 않고, 같은 원본이면 같은 이름이라 다시 돌려도 덮어쓴다.
export function storagePath(prefix, id, sourceUrl) {
  const hash = createHash('sha1').update(sourceUrl).digest('hex').slice(0, 8)
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
  return `${prefix}/${safeId}-${hash}.webp`
}

// 이미지를 우리 저장소로 옮기고 새 주소를 돌려준다.
// 옮길 필요가 없거나(이미 우리 것) 실패하면 null — 호출한 쪽은 원본을 그대로 두면 된다.
export async function mirrorImage(supabase, {
  bucket = 'event-images',
  prefix,
  id,
  sourceUrl,
  kind = 'photo',
  dryRun = false,
} = {}) {
  if (!id || !sourceUrl?.startsWith('http')) return null
  if (isOurStorage(sourceUrl)) return null

  let original, originalType
  try {
    ({ buffer: original, contentType: originalType } = await downloadImageTyped(sourceUrl))
  } catch (err) {
    // 여기서 실패하는 건 대부분 "원본이 이미 사라졌다"는 뜻이다. 그 사실을 로그로 남기는
    // 것이 이 스크립트의 부수적인 쓸모이기도 하다 — 깨진 주소를 찾아준다.
    return { error: err.message }
  }

  const { width, quality } = IMAGE_KINDS[kind] ?? IMAGE_KINDS.photo
  let converted
  try {
    converted = await sharp(original)
      .rotate() // EXIF 회전 정보 반영
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
  } catch (err) {
    return { error: `이미지를 못 읽음: ${err.message}` }
  }

  // 변환 결과가 더 크면 원본을 그대로 올린다. 이미 잘 압축된 작은 png를 webp로 바꾸면
  // 커지는 경우가 있는데, 그때 굳이 큰 쪽을 쓸 이유가 없다.
  //
  // 단, 버킷이 받아주는 형식일 때만이다. 서버가 avif를 주는 일이 흔한데(주소가 .jpg여도)
  // 그걸 원본 그대로 올리면 버킷이 거절하거나, 더 나쁘게는 avif 바이트를 image/jpeg로
  // 표시해 올려서 브라우저가 못 읽는 그림이 된다. 그럴 땐 변환본을 쓴다 —
  // 조금 커지는 것보다 안 보이는 게 훨씬 나쁘다.
  const BUCKET_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const useOriginal = converted.byteLength >= original.byteLength && BUCKET_TYPES.includes(originalType)
  const body = useOriginal ? original : converted
  const path = useOriginal
    ? storagePath(prefix, id, sourceUrl).replace(/\.webp$/, extOf(originalType))
    : storagePath(prefix, id, sourceUrl)
  const contentType = useOriginal ? originalType : 'image/webp'

  const summary = `${(original.byteLength / 1024).toFixed(0)}KB -> ${(body.byteLength / 1024).toFixed(0)}KB`
  if (dryRun) return { url: null, summary, path }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: true })
  if (error) return { error: `업로드: ${error.message}` }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  if (!data?.publicUrl) return { error: '공개 주소를 못 만듦' }
  return { url: data.publicUrl, summary, path }
}

// 확장자는 서버가 밝힌 형식에서 뽑는다. 주소의 확장자를 쓰면 실제 바이트와 어긋난다.
function extOf(contentType) {
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/gif') return '.gif'
  if (contentType === 'image/webp') return '.webp'
  return '.jpg'
}
