// 한국 시간(KST) 기준 날짜 계산.
//
// 크롤러는 GitHub Actions(UTC)에서 도는데 행사 날짜는 전부 한국 기준이다. new Date()의
// getFullYear/getMonth/getDate는 실행 환경의 지역 시간(=Actions에서는 UTC)을 쓰므로,
// KST 09:00 이전(=UTC로는 전날) 구간에서는 "오늘"이 하루 어긋난다.
// 크롤 워크플로가 21:00 UTC = 06:00 KST(다음날)에 도니, 매 실행이 바로 그 구간이다.
//
// 어긋나면 생기는 일: 9월 30일 21:00 UTC(=10월 1일 KST)에 도는 실행이 "9월"로 판단해서
// 10월에만 검색하기로 한 쿼리를 건너뛰고, KOPIS/영등위 조회 기간도 하루씩 밀린다.
//
// 이미 여러 파일이 각자 todayKST()를 복사해 쓰고 있었는데(known-events, subculture-calendar,
// venue-calendar, fix-poster-images), 정작 UTC로 계산하던 곳들(naver, kopis, kmrb,
// culture-performance)이 남아 있어서 하나로 모은다.
// (notifier/src/send-notifications.mjs는 별도 패키지라 자기 사본을 그대로 쓴다.)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + KST_OFFSET_MS + offsetDays * 86400000)
}

// 'YYYY-MM-DD' (KST 기준 오늘, offsetDays만큼 밀거나 당긴 날)
export function todayKST(offsetDays = 0) {
  return kstDate(offsetDays).toISOString().slice(0, 10)
}

// 'YYYYMMDD' — KOPIS·영등위·문화예술공연 API 요청 파라미터 형식
export function compactKST(offsetDays = 0) {
  return todayKST(offsetDays).replaceAll('-', '')
}

// 1~12 (KST 기준 이번 달)
export function monthKST() {
  return Number(todayKST().slice(5, 7))
}

// 'MM-DD' — 연도와 무관한 기간 판정용
export function monthDayKST() {
  return todayKST().slice(5)
}
