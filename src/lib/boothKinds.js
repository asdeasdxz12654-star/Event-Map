// 부스 항목(event_booth_items)의 종류 정의와, 이미지가 없을 때 쓰는 색 타일 계산.

// 화면에 묶어서 보여주는 순서. 실제 관람 동선과 같게 뒀다 —
// 입장하며 받고 → 공짜부터 돌고 → 돈 쓰고 → 만들고 → 먹고 → 사서 나간다.
// DB의 check 제약(booth_items_2026-09-14.sql)과 목록이 같아야 한다.
export const BOOTH_KINDS = [
  { id: 'welcome', label: '웰컴 키트' },
  { id: 'free', label: '무료 체험' },
  { id: 'paid', label: '유료 체험' },
  { id: 'diy', label: 'DIY' },
  { id: 'food', label: '푸드존' },
  { id: 'goods', label: '굿즈' },
]

const KIND_ORDER = Object.fromEntries(BOOTH_KINDS.map((k, i) => [k.id, i]))

export function kindLabel(id) {
  return BOOTH_KINDS.find(k => k.id === id)?.label ?? id
}

// 항목을 종류별로 묶어 BOOTH_KINDS 순서로 돌려준다. [{ kind, label, items }]
// 알 수 없는 kind(나중에 DB에만 추가된 값)는 버리지 않고 맨 뒤로 보낸다.
export function groupByKind(items) {
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.kind)) groups.set(item.kind, [])
    groups.get(item.kind).push(item)
  }
  return [...groups.entries()]
    .sort((a, b) => (KIND_ORDER[a[0]] ?? 99) - (KIND_ORDER[b[0]] ?? 99))
    .map(([kind, list]) => ({ kind, label: kindLabel(kind), items: list }))
}

// "원신 | 달빛에 전하는 세레나데" -> { main: '원신', sub: '달빛에 전하는 세레나데' }
// 파이프가 없으면 전체가 main. 부스명에 테마를 같이 적는 관례를 화면에서 두 줄로 푼다.
export function splitBoothName(name = '') {
  const i = name.indexOf('|')
  if (i < 0) return { main: name.trim(), sub: null }
  return { main: name.slice(0, i).trim(), sub: name.slice(i + 1).trim() || null }
}

// 이름에서 고정된 색상(hue)을 뽑는다. 같은 부스는 언제 어디서 그려도 같은 색이 되고,
// 부스마다 다른 색이 나오므로 목록에서 서로 구분된다. 이미지가 없을 때의 대체 타일과
// 게임 선택 칩의 점 색깔이 이 값을 공유해서, 칩과 카드가 같은 색으로 이어져 보인다.
export function boothHue(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360
  return hash
}

// 대체 타일에 얹을 글자. 한글 한 글자면 충분하고, 영문 이름이면 두 글자까지 쓴다.
export function boothInitial(name = '') {
  const main = splitBoothName(name).main
  const first = [...main][0] ?? '?'
  return /[A-Za-z]/.test(first) ? main.slice(0, 2) : first
}

// 24000 -> "24,000원". null/undefined면 null(무료이거나 가격 미공개).
export function formatPrice(price, priceNote) {
  if (price == null) return null
  const won = `${price.toLocaleString('ko-KR')}원`
  return priceNote ? `${won} / ${priceNote}` : won
}

// ── 부스 운영 주체 ──────────────────────────────────────────────────────────
// 같은 "부스"라도 기업 부스(수십 개)와 창작자 부스(수백~수천 개)와 주최 직영 체험은
// 규모도 찾는 방법도 다르다. 이 값 하나가 부스 탭의 세그먼트와 표시 방식을 정한다.
export const OPERATORS = [
  { id: 'company', label: '기업' },
  { id: 'creator', label: '창작자' },
  { id: 'host', label: '주최 운영' },
]

export function operatorLabel(id) {
  return OPERATORS.find(o => o.id === id)?.label ?? '기타'
}

// ── 굿즈의 타이틀(IP) 축 ────────────────────────────────────────────────────
// item.title이 비어 있으면 부스 이름을 타이틀로 본다.
// 호요랜드는 부스 = 게임 타이틀("원신 | 달빛에 전하는 세레나데")이라 이 대체만으로
// 게임 필터가 그대로 동작한다 — 옛 데이터를 한 줄도 고치지 않아도 된다.
// 지스타처럼 한 부스가 여러 타이틀을 다루는 행사에서만 title을 채워 넣으면 된다.
export function itemTitle(item, booth) {
  if (item.title) return item.title
  return booth ? splitBoothName(booth.name).main : null
}

// ── 가격 구간 ───────────────────────────────────────────────────────────────
// 구간을 고정값으로 박지 않고 실제 분포에서 만든다. 8천원짜리 키링만 파는 행사에
// "5만원 이상" 칸이 떠 있으면 누를 수 없는 선택지가 화면을 차지할 뿐이다.
const BUCKET_EDGES = [10000, 30000, 50000, 100000]

export function priceBuckets(items) {
  const prices = items.map(i => i.price).filter(p => p != null)
  if (prices.length === 0) return []

  const max = Math.max(...prices)
  const edges = BUCKET_EDGES.filter(e => e < max)
  const bounds = [0, ...edges, Infinity]

  const buckets = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const min = bounds[i]
    const limit = bounds[i + 1]
    const count = prices.filter(p => p >= min && p < limit).length
    if (count === 0) continue
    buckets.push({
      id: `${min}-${limit}`,
      label: limit === Infinity
        ? `${formatManwon(min)} 이상`
        : min === 0
          ? `${formatManwon(limit)} 미만`
          : `${formatManwon(min)}~${formatManwon(limit)}`,
      count,
      min,
      limit,
    })
  }

  // 가격이 공개되지 않은 것도 하나의 조건이다 — 숨기면 "내가 본 목록이 전부인가"를
  // 알 수 없다. 이 서비스는 모르는 건 모른다고 적는 쪽을 택해 왔다.
  const unknown = items.length - prices.length
  if (unknown > 0) {
    buckets.push({ id: 'unknown', label: '가격 미공개', count: unknown, min: null, limit: null })
  }
  return buckets
}

function formatManwon(won) {
  return won % 10000 === 0 ? `${won / 10000}만` : `${(won / 10000).toFixed(1)}만`
}

export function matchesBucket(item, bucket) {
  if (!bucket) return true
  if (bucket.id === 'unknown') return item.price == null
  return item.price != null && item.price >= bucket.min && item.price < bucket.limit
}

// 지금 화면에 보이는 목록의 가격 범위. 필터를 걸면 범위도 함께 바뀌어야 한다 —
// 하나만 보고 있는데 전체 범위가 떠 있으면 그 숫자가 무엇의 범위인지 알 수 없다.
export function priceRangeLabel(items) {
  const prices = items.map(i => i.price).filter(p => p != null)
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatPrice(min) : `${formatPrice(min)}~${formatPrice(max)}`
}
