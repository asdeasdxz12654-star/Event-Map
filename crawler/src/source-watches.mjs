// 공식 소스 감시 — 정의와 판정 로직.
//
// 하는 일은 하나다. 정해진 주소를 열어 "관심 있는 링크·이미지가 어제와 달라졌는가"만 본다.
// 값을 읽어내지 않는다 — 이미지 속 가격표·시간표를 모델로 읽는 건 이 저장소가 이미
// 틀린 값을 만들어 본 방법이다(hoyoland_goods_2026-09-14.sql 주석).
//
// 왜 페이지 전체를 해시하지 않나
//   조회수·배너·세션 토큰 때문에 매번 달라진다. 그러면 "바뀌었다"가 매일 울리는 경보가
//   되고, 곧 아무도 안 본다. 그래서 링크(텍스트+주소)와 이미지 주소만 뽑고, 그중에서도
//   match 정규식에 걸리는 것만 남겨 해시한다.
import { createHash } from 'node:crypto'
import { UA, fetchHtml } from './util.mjs'
import { imageSizeFromBytes } from './official-site-poster.mjs'

// 감시 대상.
//
// 여기 적힌 주소는 known-events.mjs의 booth_info_note·floor_plan_note에 사람 말로 적혀
// 있던 바로 그 주소들이다. "행사 2~3주 전 gstar.or.kr 전시장 안내 페이지에 공개"를
// 기계가 확인할 수 있는 형태로 옮긴 것.
export const WATCHES = [
  {
    key: 'gstar-venue',
    label: '지스타 — 전시장 안내 · 참가사',
    eventTitle: '지스타',
    url: 'https://www.gstar.or.kr/',
    // 2026-09-15 확인: 이 메뉴들이 javascript:void(0)로 비활성이다. 실제 주소로 바뀌는
    // 순간이 곧 배치도·참가사 공개 시점이다.
    match: /전시장|참가사|배치도|부스|booth|floor|hall|exhibit/i,
    floorPlan: true,
  },
  {
    key: 'comicworld-map',
    label: '코믹월드 — 동아리 배치도',
    eventTitle: '코믹월드',
    url: 'https://comicw.net/map/',
    // 회차별 배치도가 올라오면 이미지가 바뀐다.
    match: /map|배치|\.(jpg|jpeg|png|webp)/i,
    floorPlan: true,
  },
  // 일러스타페스(illustar.net)는 여기 없다. 본문이 script 태그 하나뿐인 SPA라
  // HTML에서 링크·이미지가 아예 안 나온다(2026-09-15 확인: 2.5KB, 링크 0개).
  // 감시해봐야 신호가 늘 0이라 "바뀌었다"를 영영 못 잡는다. 공개 시점 안내는
  // known-events.mjs의 floor_plan_note가 계속 맡는다.
  {
    key: 'agf-site',
    label: 'AGF — 참가사 안내',
    eventTitle: 'AGF',
    url: 'https://www.agfkorea.com/',
    match: /참가|부스|배치|스테이지|타임|booth|stage/i,
    floorPlan: true,
  },
  {
    key: 'playx4-site',
    label: '플레이엑스포 — 참가사 명단',
    eventTitle: '플레이엑스포',
    // 최상위는 한/영 선택 스플래시라 링크가 넷뿐이다. 실제 메인을 본다.
    url: 'https://www.playx4.or.kr/b2c/main/main.php',
    match: /참가|부스|배치|booth|floor/i,
    floorPlan: true,
  },
  {
    key: 'hoyoland-site',
    label: '호요랜드 — 공식 안내 페이지',
    eventTitle: '호요랜드',
    url: 'https://sites.google.com/mihoyo.com/hoyoland2026/hoyoland2026',
    // 이 행사는 공지가 전부 이미지라, 여기서 알 수 있는 건 "뭔가 추가됐다"뿐이다.
    // 그거면 충분하다 — 읽는 건 사람이 한다.
    match: null,
    floorPlan: false,
  },
]

// 배치도로 볼 만한 이미지의 최소 조건. 배치도는 거의 항상 넓고 크다.
const PLAN_MIN_WIDTH = 1200
const PLAN_MIN_RATIO = 1.2
const PLAN_MAX_CANDIDATES = 6
const IMAGE_HEAD_BYTES = 65_536

// 링크와 이미지 주소만 뽑는다. 링크는 보이는 글자까지 함께 봐야 "전시장 안내" 메뉴가
// 살아났는지 알 수 있다 — 주소만 보면 javascript:void(0)에서 실제 주소로 바뀐 것이
// 그냥 "새 링크 하나"로 보인다.
export function extractSignals(html, baseUrl) {
  const signals = []

  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    signals.push(`a|${text}|${absolute(m[1], baseUrl) ?? m[1]}`)
  }
  for (const m of html.matchAll(/<img\b[^>]*?(?:data-src|src)=["']([^"']+)["']/gi)) {
    signals.push(`img|${absolute(m[1], baseUrl) ?? m[1]}`)
  }

  return signals
}

function absolute(src, baseUrl) {
  try { return new URL(src, baseUrl).href } catch { return null }
}

// 신호를 걸러 해시한다. 정렬하는 이유: 같은 내용인데 순서만 바뀌는 사이트(랜덤 배너 등)에서
// 매번 "바뀌었다"가 뜨지 않게.
export function hashSignals(signals, match) {
  const kept = [...new Set(match ? signals.filter(s => match.test(s)) : signals)].sort()
  return {
    hash: createHash('sha1').update(kept.join('\n')).digest('hex'),
    count: kept.length,
  }
}

// 배치도 후보 — 실제로 내려받아 크기를 재야 한다. 페이지의 <img>에는 width/height가
// 안 적혀 있는 경우가 대부분이라 태그만 보고는 로고인지 배치도인지 알 수 없다.
// 파일 앞부분만 받아 헤더에서 크기를 읽는다(official-site-poster.mjs와 같은 방법).
export async function findFloorPlanCandidates(signals, limit = PLAN_MAX_CANDIDATES) {
  const urls = [...new Set(
    signals
      .filter(s => s.startsWith('img|'))
      .map(s => s.slice(4))
      .filter(u => /^https?:/.test(u))
      .filter(u => !/logo|icon|btn|sprite|favicon|banner_s|thumb/i.test(u))
  )]

  const found = []
  for (const url of urls) {
    if (found.length >= limit) break
    const size = await imageSize(url)
    if (!size) continue
    const ratio = size.width / size.height
    if (size.width < PLAN_MIN_WIDTH || ratio < PLAN_MIN_RATIO) continue
    found.push({ url, width: size.width, height: size.height })
  }
  // 큰 것부터 — 배치도는 그 페이지에서 가장 큰 그림인 경우가 많다.
  return found.sort((a, b) => b.width - a.width)
}

async function imageSize(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Range: `bytes=0-${IMAGE_HEAD_BYTES - 1}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return imageSizeFromBytes(buf)
  } catch {
    return null
  }
}

// 한 대상을 확인한다. 바뀌었는지 판정만 하고 저장은 호출부가 한다.
export async function checkWatch(watch, previousHash) {
  let html
  try {
    html = await fetchHtml(watch.url)
  } catch (err) {
    return { error: err.message }
  }
  if (!html) return { error: '본문을 못 받음' }

  const signals = extractSignals(html, watch.url)
  const { hash, count } = hashSignals(signals, watch.match)

  // 관심 신호가 하나도 없으면 감시가 죽은 것이다 — 사이트가 SPA로 바뀌었거나
  // match가 더 이상 안 맞는다. 이걸 "그대로"로 처리하면 조용히 영영 안 울린다.
  if (count === 0) {
    return { error: '관심 신호 0개 — 페이지 구조가 바뀌었거나 match가 안 맞습니다' }
  }

  // 처음 보는 대상은 "바뀐 것"으로 치지 않는다. 그랬다가는 감시를 켜는 날 전부가
  // 알림으로 쏟아지고, 그중 진짜는 하나도 없다.
  const changed = !!previousHash && previousHash !== hash

  let candidates = []
  if (changed && watch.floorPlan) {
    candidates = await findFloorPlanCandidates(signals)
  }

  return { hash, count, changed, first: !previousHash, candidates }
}
