// 같은 행사인지 보는 규칙. 화면(관리자 대시보드)과 크롤러가 같은 값을 쓴다.
//
// 쓰는 곳
//   src/lib/duplicates.js   — 이미 들어온 행사 중 중복 의심을 띄운다
//   crawler/src/crawl.mjs   — 자동 승인 직전에 중복 의심이면 승인하지 않고 검수 대기로 남긴다
//
// 왜 크롤러가 한 번 더 보나
//   DB 트리거(promote_event_draft)는 "정규화 제목 + 시작일"이 정확히 같을 때만 기존 행사에
//   연결한다. 그 밖은 전부 새 행사가 된다. 그런데 같은 행사가 소스마다 다르게 들어온다 —
//
//     지스타 2026 / 2026 지스타                  → 연도 위치
//     [서울] ○○ 콘서트 / ○○ 콘서트              → 지역 접두사
//     11-14 시작 / 11-13 시작                    → LLM이 요약문만 보고 날짜를 추측
//
//   대시보드가 나중에 "중복 의심"을 띄워주긴 하지만, 그땐 이미 방문자 화면에 두 줄로
//   올라가 있다. 북마크·알림이 엉뚱한 쪽에 붙고 나서다.
//
// 왜 합치지 않고 보류만 하나
//   여기 규칙은 느슨하다. 느슨한 규칙으로 합치면 틀렸을 때 되돌릴 수 없다("코믹월드 337"과
//   "338"을 합치는 식). 보류는 틀려도 관리자가 승인 한 번 누르면 끝이다.

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

// 기간이 겹친다는 전제 아래에서만 쓰는 키. looseTitle에서 연도까지 뗀다.
//
// looseTitle이 연도를 남기는 이유는 "2026"과 "2027"을 가르기 위해서인데, 기간이
// 겹치는 두 행사는 이미 같은 해다. 그러면 연도는 위치만 다를 뿐("지스타 2026" /
// "2026 지스타") 정보가 없다. 기간 겹침 없이 이 키만 쓰면 안 된다.
function periodScopedTitle(t) {
  const withoutYear = (t ?? '').replace(/(19|20)\d{2}\s*년?/g, ' ')
  return looseTitle(withoutYear)
}

// 기간이 하루라도 겹치는가. end_date가 없으면 하루짜리로 본다.
export function overlaps(a, b) {
  const aStart = a.start_date
  const aEnd = a.end_date ?? a.start_date
  const bStart = b.start_date
  const bEnd = b.end_date ?? b.start_date
  if (!aStart || !bStart) return false
  return aStart <= bEnd && bStart <= aEnd
}

// 장소가 같은가. 한쪽이 다른 쪽을 품으면 같다고 본다 —
// "벡스코" / "벡스코 제1전시장"처럼 홀 이름이 붙고 안 붙고가 소스마다 다르다.
// 두 글자 미만은 비교하지 않는다(빈 값·한 글자가 모든 장소를 품게 된다).
function sameVenue(a, b) {
  const va = normalizedTitle(a)
  const vb = normalizedTitle(b)
  if (va.length < 2 || vb.length < 2) return false
  return va.includes(vb) || vb.includes(va)
}

// 새로 들어올 행사(draft)가 이미 있는 행사와 겹쳐 보이는가.
//
// draft · events 모두 { title, start_date, end_date, venue } (events에는 id도).
// 돌려주는 것: { event, reason } | null
//
// 엄격 규칙(정규화 제목 + 시작일)에 걸리는 행사가 있으면 null이다. 그 경우는 트리거가
// 기존 행사에 연결만 하고 새로 만들지 않으므로, 보류할 이유가 없다 — 승인해야 연결된다.
export function findSuspectedDuplicate(draft, events) {
  const title = normalizedTitle(draft.title)
  if (!title || !draft.start_date) return null

  if (events.some(e => normalizedTitle(e.title) === title && e.start_date === draft.start_date)) {
    return null
  }

  const key = periodScopedTitle(draft.title)
  for (const event of events) {
    if (!overlaps(draft, event)) continue
    if (key && periodScopedTitle(event.title) === key) {
      return { event, reason: '제목이 사실상 같고 기간이 겹침' }
    }
    if (sameVenue(draft.venue, event.venue)) {
      return { event, reason: '같은 장소에서 기간이 겹침' }
    }
  }
  return null
}
