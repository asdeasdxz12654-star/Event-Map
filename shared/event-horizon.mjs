// 행사를 "지금 보여줄 것"과 "아직 먼 것"으로 가르는 선. 화면과 크롤러가 같은 값을 쓴다.
//
// 왜 한 군데에 두나
//   둘은 같은 선이어야 한다. 크롤러가 자동 승인한 행사는 사이트에 바로 올라가는데,
//   그 행사가 기본 목록의 지평선 밖이면 아무도 못 보는 자리에 올리는 셈이다. 반대로
//   크롤러 쪽 선이 더 멀면 내년 행사가 검수 없이 목록에 끼어든다 — 실제로 그렇게
//   되어 있었다(KINTEX는 지난 행사만 막고 앞쪽은 안 막았다).
//
//   값을 양쪽에 따로 적어두면 한쪽만 고치고 끝나는 날이 온다. 이 저장소는 그걸 이미
//   여러 번 겪어서 todayKST()와 카테고리 색을 한 군데로 모았다(crawler/src/date-kst.mjs,
//   src/data/events.js). 같은 이유로 이 선도 여기 하나만 둔다.
//
// 쓰는 곳
//   src/data/events.js      — 예정 탭이 기본으로 보여주는 범위
//   crawler/src/crawl.mjs   — 이 선 밖 행사는 자동 승인하지 않고 검수 대기로 남긴다
//
// 날짜 문자열('YYYY-MM-DD')만 받고 Date를 받지 않는다. 화면은 브라우저 지역 시간,
// 크롤러는 KST로 "오늘"을 구하는데(crawler/src/date-kst.mjs), 그 차이는 부르는 쪽이
// 이미 해결한 뒤다. 여기서 또 시간대를 다루면 어느 쪽 기준인지 알 수 없어진다.

// 연말에 보장하는 최소 일수.
//
// 선이 "올해 12월 31일"인 이유
//   사람이 행사를 생각하는 단위가 연도다. 10월에 들어온 사람에게 내년 3월 행사는
//   "지금 챙길 것"이 아니다. 앞서 롤링 6개월로 뒀더니 10월의 지평선이 내년 4월이 돼서,
//   내년 1~4월 행사가 예정 탭에 그대로 남았다 — 롤링으로는 "내년"을 뺄 수가 없다.
//
// 그런데 연도로만 자르면
//   12월 28일에 들어온 사람은 예정 탭에서 아무것도 못 본다. 삼 주 뒤 행사가 "내년"이라
//   접히기 때문이다. 이건 useEvents.js가 길게 경고하는 연말 함정과 같은 종류다.
//
// 그래서 하한을 둔다
//   지평선 = max(올해 12월 31일, 오늘 + 60일).
//   1년의 대부분은 연말이 이겨서 내년 행사가 전부 접히고, 11월 초부터는 하한이 이겨서
//   코앞인 내년 초 행사가 펼쳐진 쪽에 남는다.
export const HORIZON_MIN_DAYS = 60

// 'YYYY-MM-DD'에 일수를 더한다. Date.UTC만 써서 지역 시간이 끼어들지 않게 한다
// (월말·연말 넘김은 Date.UTC가 알아서 한다).
function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// 기준일에서 본 지평선의 'YYYY-MM-DD'. 이 날짜까지가 "가까운 것"이다(당일 포함).
export function horizonFrom(ymd, minDays = HORIZON_MIN_DAYS) {
  const yearEnd = `${ymd.slice(0, 4)}-12-31`
  const floor = addDays(ymd, minDays)
  return floor > yearEnd ? floor : yearEnd
}

// 이 행사가 지평선 밖인가. 날짜가 없으면 "밖"으로 보지 않는다 —
// 날짜를 모르는 것과 먼 것은 다르고, 모르는 것을 조용히 치우면 찾을 길이 없어진다.
export function isBeyondHorizon(startDate, todayYmd, minDays = HORIZON_MIN_DAYS) {
  if (!startDate) return false
  return startDate > horizonFrom(todayYmd, minDays)
}
