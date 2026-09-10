// 행사 공식 사이트의 메인 비주얼(배너)을 포스터로 가져온다.
//
// 왜 이 방법이 먼저인가
//   포스터를 이미지 검색으로 찾는 건 결국 남이 올린 사본을 찾는 일이라, 기사 사진·굿즈
//   매물·공모전 포스터를 걸러내느라 조건을 계속 조여야 했고 그만큼 놓치는 것도 많다.
//   반면 공식 사이트 첫 화면에 걸린 큰 이미지는 주최 측이 직접 올린 그 행사의 키비주얼
//   자체다. 검색 크레딧도 안 든다.
//   실제로 "포켓몬 메가페스타 2026: 피카츄의 가을 나들이"는 이미지 검색으로는 못 찾았는데
//   (회사 사이트 안의 하위 페이지라 공식 사이트 자동 탐색에도 안 걸린다),
//   pokemonkorea.co.kr/pikachu_9 에는 4500x5667짜리 공식 키비주얼이 그대로 걸려 있다.
//
// 언제 쓰면 안 되는가
//   한 사이트가 여러 행사를 다루면 첫 화면 배너는 "지금 미는 행사" 것이지 이 행사 것이
//   아니다(comicw.net의 코믹월드 배너를 문구전 포스터로 쓸 수는 없다). 그래서
//   호출하는 쪽에서 isDedicatedSite()로 "이 행사 전용 사이트인지" 확인하고 부른다.
//   예매처·SNS·전시장·행사 모음 사이트는 여기서도 한 번 더 막는다.
import { isAggregatorUrl, isNewsPhotoUrl, isSharedPlatform, isUsableImageUrl } from './poster-filter.mjs'
import { UA, fetchHtml } from './util.mjs'

const IMAGE_HEAD_BYTES = 65_536 // 크기 정보는 파일 앞부분에 있다 — 통째로 받지 않는다
// 카드 썸네일로 쓰기엔 너무 무거운 원본은 거른다. 포켓몬 키비주얼 원본이 8.2MB였는데,
// 그걸 목록 카드에 그대로 걸면 모바일에서 목록 한 화면에 수십 MB를 받게 된다.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// 메인 비주얼이 들어 있는 영역의 class/id에 흔히 쓰이는 말
const VISUAL_HINTS = ['main-visual', 'mainvisual', 'main_visual', 'key-visual', 'keyvisual',
  'key_visual', 'visual', 'banner', 'hero', 'poster', 'kv']

// 로고·아이콘·버튼처럼 포스터일 리 없는 이미지.
// 뒷줄은 "사이트 공용 공유 이미지" — 행사와 무관한 기본 썸네일이라 포스터로 쓰면 안 된다
// (일러스타페스의 og-default.webp, 부천국제만화축제의 sns_link.jpg가 그렇게 잡혔다).
const NOT_POSTER_HINTS = ['logo', 'icon', 'btn_', '/btn', 'button', 'sprite', 'bullet',
  'arrow', 'favicon', 'footer', 'header_', 'nav_', 'blank', 'spacer', 'loading',
  'og-default', 'og_default', 'ogdefault', 'sns_link', 'sns-link', 'share_', '_share',
  'sharing', 'default_thumb', 'thumb_default', 'noimage', 'no_image']

function absoluteUrl(src, baseUrl) {
  try { return new URL(src, baseUrl).href } catch { return null }
}

// 이미지 파일 앞부분만 받아 가로·세로를 읽는다. 포스터인지 로고인지는 크기·비율로
// 가려야 하는데, 페이지의 <img> 태그에는 width/height가 안 적혀 있는 경우가 대부분이다.
export function imageSizeFromBytes(buf) {
  const b = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const len = buf.byteLength

  // PNG: 8바이트 시그니처 + IHDR(길이4+타입4) 다음에 width/height
  if (len >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: b.getUint32(16), height: b.getUint32(20) }
  }

  // GIF: "GIF8" + 리틀엔디안 width/height
  if (len >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: b.getUint16(6, true), height: b.getUint16(8, true) }
  }

  // WebP: RIFF....WEBP + VP8X/VP8L/VP8(simple)
  if (len >= 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
    const fourcc = String.fromCharCode(buf[12], buf[13], buf[14], buf[15])
    if (fourcc === 'VP8X') {
      const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16))
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
      return { width: w, height: h }
    }
    if (fourcc === 'VP8 ') {
      return { width: b.getUint16(26, true) & 0x3fff, height: b.getUint16(28, true) & 0x3fff }
    }
    if (fourcc === 'VP8L') {
      const bits = b.getUint32(21, true)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }

  // JPEG: SOF 마커(프레임 헤더)에 크기가 들어 있다. 마커를 따라가며 찾는다.
  if (len >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < len) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      // SOF0~SOF15 중 크기가 들어 있는 것들 (DHT 0xc4, JPG 0xc8, DAC 0xcc 제외)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.getUint16(i + 7), height: b.getUint16(i + 5) }
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      i += 2 + b.getUint16(i + 2)
    }
  }

  return null
}

export async function imageSize(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Range: `bytes=0-${IMAGE_HEAD_BYTES - 1}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok && res.status !== 206) return null
    if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return null
    // Range 응답의 content-range(bytes 0-65535/8579940)에 원본 전체 크기가 들어 있다.
    const range = res.headers.get('content-range') ?? ''
    const total = Number(/\/(\d+)$/.exec(range)?.[1] ?? res.headers.get('content-length') ?? 0)
    const size = imageSizeFromBytes(new Uint8Array(await res.arrayBuffer()))
    return size ? { ...size, bytes: total } : null
  } catch {
    return null
  }
}

// 페이지에서 포스터 후보가 될 이미지 URL을 우선순위 순으로 뽑는다.
export function extractImageCandidates(html, baseUrl) {
  const flat = html.replace(/\s+/g, ' ')
  const found = []
  const push = (src, rank) => {
    const url = absoluteUrl(src, baseUrl)
    if (!url || !url.startsWith('http')) return
    const lower = url.toLowerCase()
    if (NOT_POSTER_HINTS.some(h => lower.includes(h))) return
    if (found.some(c => c.url === url)) return
    found.push({ url, rank })
  }

  // 1순위: 사이트가 스스로 "대표 이미지"라고 밝힌 것
  for (const re of [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/gi,
  ]) {
    for (const m of flat.matchAll(re)) push(m[1], 0)
  }

  // 2순위: 메인 비주얼·배너 영역 안의 이미지
  for (const m of flat.matchAll(/<(section|div|header)([^>]*)>/gi)) {
    const attrs = m[2].toLowerCase()
    if (!VISUAL_HINTS.some(h => attrs.includes(h))) continue
    // 그 태그 이후 3000자 안의 <img>를 그 영역의 이미지로 본다 (닫는 태그 매칭은
    // 정규식으로 안정적이지 않아서, 거리로 자른다).
    const chunk = flat.slice(m.index, m.index + 3000)
    for (const img of chunk.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(img[1], 1)
  }

  // 3순위: 파일 이름이 포스터·키비주얼인 이미지
  for (const img of flat.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const lower = img[1].toLowerCase()
    if (/poster|keyvisual|key_visual|main_visual|mainvisual|kv_/.test(lower)) push(img[1], 2)
  }

  return found.sort((a, b) => a.rank - b.rank)
}

// 포스터로 쓸 만한 크기·비율인지. 키비주얼은 크게 만들기 때문에 짧은 변이 400px은 넘는다.
const MIN_SIDE_PX = 400
const MAX_PORTRAIT_RATIO = 3    // 세로로 너무 긴 띠 제외
const MAX_LANDSCAPE_RATIO = 2.6 // 가로형 키비주얼(1920x775 = 2.48)까지는 인정
// og:image가 아닌 후보는 이 정도로 커야 인정한다 (키비주얼은 인쇄용 원본을 그대로 올린다)
const MIN_LONG_SIDE_PX = 1000

function usableSize({ width, height }) {
  if (!width || !height) return false
  if (width < MIN_SIDE_PX || height < MIN_SIDE_PX) return false
  // 1200x630은 링크 미리보기 카드 표준 규격이다 — 그 크기로 만들어 둔 이미지는
  // 포스터가 아니라 "공유용 대표 이미지"다.
  if (width === 1200 && (height === 630 || height === 628)) return false
  return width > height ? width / height <= MAX_LANDSCAPE_RATIO : height / width <= MAX_PORTRAIT_RATIO
}

// URL에 다른 연도가 박혀 있으면 지난 회차 배너다 (/2025/09/ 같은 업로드 경로).
function yearConflicts(url, eventYear) {
  if (!eventYear) return false
  const years = [...String(url).matchAll(/(?:^|[/._-])(20[0-4]\d)(?=[/._-])/g)].map(m => Number(m[1]))
  return years.length > 0 && !years.includes(eventYear)
}

// 공식 사이트에서 포스터를 가져온다. 못 찾으면 null.
//   siteUrl  : 행사 공식 사이트(또는 그 행사 페이지) 주소
//   eventYear: 행사 개최 연도 — 지난 회차 배너를 거르는 데 쓴다
export async function fetchPosterFromOfficialSite(siteUrl, { eventYear = null } = {}) {
  if (!siteUrl || !siteUrl.startsWith('http')) return null
  // 내년 행사는 사이트에 아직 이번 회차 자료가 안 올라와 있다. 그 상태로 배너를 집으면
  // 지난 회차 키비주얼이 그대로 붙는다 — 파일 이름에 연도가 없으면 연도 검사도 못 걸러낸다
  // (AGF 2027에 AGF 2026 캐릭터 이미지가 붙었다). 이미지 검색 쪽과 같은 정책으로 막는다.
  if (eventYear && eventYear > new Date().getFullYear()) return null
  // 여러 행사가 함께 쓰는 곳의 배너는 이 행사 것이 아니다
  if (isSharedPlatform(siteUrl) || isAggregatorUrl(siteUrl) || isNewsPhotoUrl(siteUrl)) return null

  let html
  try {
    html = await fetchHtml(siteUrl)
  } catch (err) {
    console.log(`  -> 공식 사이트 배너: 페이지를 못 읽음 (${err.message})`)
    return null
  }

  const candidates = extractImageCandidates(html, siteUrl)
  if (candidates.length === 0) return null

  const measured = []
  for (const candidate of candidates.slice(0, 8)) { // 페이지당 최대 8장만 확인
    if (yearConflicts(candidate.url, eventYear)) continue
    const size = await imageSize(candidate.url)
    if (!size || !usableSize(size)) continue
    // 사이트가 스스로 대표 이미지라고 밝힌 것(og:image)이 아니라면, 인쇄물 수준으로
    // 큰 것만 인정한다. 배너 영역 안에도 장식용 그림이 섞여 있어서다 — 대전콘텐츠페어
    // 첫 화면의 759x770짜리 안내 그래픽이 그렇게 포스터로 잡혔다.
    if (candidate.rank > 0 && Math.max(size.width, size.height) < MIN_LONG_SIDE_PX) continue
    if (size.bytes > MAX_IMAGE_BYTES) continue // 너무 무거운 원본
    measured.push({ ...candidate, ...size })
  }
  if (measured.length === 0) return null

  // 같은 키비주얼이 PC용(가로)·모바일용(세로)으로 함께 걸려 있는 경우가 많다.
  // 카드·상세 어디에 넣어도 세로형이 포스터답게 보이므로 세로형을 먼저 고르고,
  // 그다음은 큰 것(=원본에 가까운 것) 순이다.
  measured.sort((a, b) => {
    const portrait = c => (c.height > c.width ? 1 : 0)
    if (portrait(a) !== portrait(b)) return portrait(b) - portrait(a)
    if (a.rank !== b.rank) return a.rank - b.rank
    return b.width * b.height - a.width * a.height
  })

  for (const best of measured) {
    if (!await isUsableImageUrl(best.url)) continue
    console.log(`  -> 포스터: 공식 사이트 배너 (${best.width}x${best.height}) ${best.url.slice(0, 70)}...`)
    return best.url
  }
  return null
}
