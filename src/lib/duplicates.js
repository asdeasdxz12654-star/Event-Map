// 같은 행사가 두 줄로 들어와 있는가.
//
// 왜 화면에서 한 번 더 보나
//   DB에도 중복 검사가 있다(promote_event_draft 트리거 + normalized_title()). 그건
//   승인 시점에 돌고, 규칙이 엄격하다 — 띄어쓰기·문장부호만 떼고 글자는 건드리지 않는다.
//   엄격해야 하는 이유는 그 검사의 결과가 "자동으로 합친다"이기 때문이다.
//   "코믹월드 337"과 "338"을 합쳐버리면 되돌릴 수 없다.
//
//   그래서 엄격한 규칙은 손대지 않고, 여기에 느슨한 판정을 따로 둔다. 여기 결과는
//   합치는 게 아니라 "사람 눈에 띄게" 하는 것뿐이라, 조금 틀려도 손해가 없다.
//
// 실제로 세 번 있었던 일
//   호요랜드2026 / 호요랜드 2026                      → 띄어쓰기 (엄격 규칙으로 잡힘)
//   제2회 게임 취업 토크콘서트 / 제2회 부산콘텐츠아카데미… → 기사마다 다른 이름
//   제29회 부천국제만화축제 / …(BICOF) / 부천 국제만화축제 → 접미사와 회차
//
//   뒤의 둘은 엄격 규칙을 그대로 통과했다. 화면에는 "중복 의심 0"이 떠 있었고,
//   사람이 목록을 눈으로 훑다가 발견했다.

// SQL의 public.normalized_title()을 그대로 옮긴 것.
//
// 규칙이 갈라지지 않게 원본 SQL을 함께 적어둔다.
//   lower(regexp_replace(regexp_replace(t, '[[:space:]]+', ''), '[[:punct:]·∙‧・]+', ''))
export function normalizedTitle(t) {
  return (t ?? '')
    .replace(/\s+/g, '')
    .replace(/[!-/:-@[-`{-~·∙‧・]+/g, '')
    .toLowerCase()
}

// 느슨한 쪽. 엄격 규칙에 더해 두 가지를 더 뗀다.
//
//   괄호 안   "제29회 부천국제만화축제(BICOF)" → 영문 약칭·부제가 여기 들어간다
//   회차      "제29회 …"                      → 기사마다 붙이기도 하고 빼기도 한다
//
// 괄호를 문장부호 제거보다 **먼저** 처리해야 한다. 순서가 바뀌면 괄호만 사라지고
// 안의 글자가 제목에 붙어버린다 — "…축제(BICOF)"가 "…축제bicof"가 되어 여전히 다르다.
//
// 연도(2026)는 떼지 않는다. "호요랜드 2026"과 "호요랜드 2027"은 다른 행사다.
// 회차를 떼는 것도 위험할 수 있어서("제94회 코스앤코믹" · "제95회 코스앤코믹"이
// 같아진다) 반드시 기간이 겹치는지 함께 본다 — 회차가 다르면 날짜도 다르다.
export function looseTitle(t) {
  const withoutParens = (t ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
  const withoutRound = withoutParens.replace(/제?\s*\d+\s*회/g, ' ')
  return normalizedTitle(withoutRound)
}

// 기간이 하루라도 겹치는가. end_date가 없으면 하루짜리로 본다.
function overlaps(a, b) {
  const aStart = a.start_date
  const aEnd = a.end_date ?? a.start_date
  const bStart = b.start_date
  const bEnd = b.end_date ?? b.start_date
  if (!aStart || !bStart) return false
  return aStart <= bEnd && bStart <= aEnd
}

// rows: [{ id, title, start_date, end_date }]
//
// 돌려주는 것: [{ title, startDate, ids, reason }]
//   reason은 왜 걸렸는지다. 이게 없으면 사람이 목록을 보고 "이게 왜 여기 있지"를
//   매번 다시 판단해야 한다 — 특히 느슨한 쪽은 제목이 눈에 띄게 다를 수 있다.
export function findDuplicates(rows) {
  const groups = new Map()
  const seen = new Set()   // 이미 어느 묶음에 들어간 id

  // 1) 엄격 — 제목(띄어쓰기·문장부호 제거)과 시작일이 같다.
  //    DB 트리거와 같은 규칙이다. 트리거를 안 거치고 들어온 행(크롤러 직접 insert,
  //    관리자 수동 추가)이 여기 걸린다.
  for (const row of rows) {
    const title = normalizedTitle(row.title)
    // 제목이 비어 있으면 묶지 않는다. 빈 값은 "같다"가 아니라 "모른다"인데,
    // 키로 쓰면 제목 없는 행들이 전부 서로의 중복으로 보인다.
    if (!title) continue
    const key = `${title}|${row.start_date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  const found = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.forEach(r => seen.add(r.id))
    found.push({
      title: group[0].title,
      startDate: group[0].start_date,
      ids: group.map(r => r.id),
      reason: '제목·시작일이 같음',
    })
  }

  // 2) 느슨 — 괄호와 회차를 떼면 제목이 같고, 기간이 겹친다.
  //
  // 기간을 함께 보는 것이 핵심이다. 제목만 보면 "제94회 코스앤코믹"과
  // "제95회 코스앤코믹"이 같은 묶음이 된다 — 회차만 다른 연속 행사는
  // 이름이 원래 같고, 그것을 가르는 것은 날짜다.
  const looseGroups = new Map()
  for (const row of rows) {
    if (seen.has(row.id)) continue   // 엄격 쪽에서 이미 잡힌 것은 두 번 안 띄운다
    const key = looseTitle(row.title)
    if (!key) continue
    if (!looseGroups.has(key)) looseGroups.set(key, [])
    looseGroups.get(key).push(row)
  }

  for (const group of looseGroups.values()) {
    if (group.length < 2) continue
    // 같은 이름이라도 기간이 안 겹치면 다른 회차다. 겹치는 것끼리만 묶는다.
    for (const cluster of clusterByOverlap(group)) {
      if (cluster.length < 2) continue
      found.push({
        title: cluster[0].title,
        startDate: cluster[0].start_date,
        ids: cluster.map(r => r.id),
        reason: '제목이 사실상 같고 기간이 겹침',
      })
    }
  }

  return found
}

// 기간이 겹치는 것끼리 묶는다. A-B가 겹치고 B-C가 겹치면 셋을 한 묶음으로 본다 —
// 하루짜리로 잘못 들어온 행이 사이를 이어주는 경우가 실제로 있었다
// (부천: 09.18~09.20 두 건과 09.18 하루 한 건).
function clusterByOverlap(rows) {
  const remaining = [...rows].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
  const clusters = []

  while (remaining.length > 0) {
    const cluster = [remaining.shift()]
    let grew = true
    while (grew) {
      grew = false
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (cluster.some(c => overlaps(c, remaining[i]))) {
          cluster.push(remaining.splice(i, 1)[0])
          grew = true
        }
      }
    }
    clusters.push(cluster)
  }
  return clusters
}
