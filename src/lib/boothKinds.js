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
