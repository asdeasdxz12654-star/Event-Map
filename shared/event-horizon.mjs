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

// 일수가 아니라 달 수로 센다. 180일은 계절에 따라 끝나는 달이 달라져서
// "6개월"이라고 적어 둔 것과 화면이 어긋난다.
export const UPCOMING_HORIZON_MONTHS = 6

const pad = n => String(n).padStart(2, '0')

// 'YYYY-MM-DD' 기준 N개월 뒤의 'YYYY-MM-DD'.
//
// 기준일부터 미끄러지는 값이다. "올해 남은 것"으로 자르면 12월에 들어온 사람에게 코앞인
// 1월 행사가 안 보이는데(그 함정은 src/hooks/useEvents.js에 적혀 있다), 롤링이면 그 일이
// 일어나지 않는다 — 12월 6일의 지평선은 이듬해 6월 6일이다.
export function horizonFrom(ymd, months = UPCOMING_HORIZON_MONTHS) {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = m - 1 + months // 0-indexed
  const year = y + Math.floor(target / 12)
  const month = ((target % 12) + 12) % 12

  // 그 달에 없는 날짜는 그 달 마지막 날로 맞춘다. 8/31 + 6개월을 그냥 넘기면
  // "2월 31일"이 3월 3일로 넘어가서 지평선이 며칠 밀린다.
  // (Date.UTC만 쓴다 — 며칠인지 세는 데에는 지역 시간이 끼어들 이유가 없다.)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`
}

// 이 행사가 지평선 밖인가. 날짜가 없으면 "밖"으로 보지 않는다 —
// 날짜를 모르는 것과 먼 것은 다르고, 모르는 것을 조용히 치우면 찾을 길이 없어진다.
export function isBeyondHorizon(startDate, todayYmd, months = UPCOMING_HORIZON_MONTHS) {
  if (!startDate) return false
  return startDate > horizonFrom(todayYmd, months)
}
