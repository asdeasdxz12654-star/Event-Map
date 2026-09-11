// 행사를 사용자의 캘린더에 넣는다.
//
// 기기마다 되는 방법이 다르다.
//   아이폰·PC : .ics 파일을 내려주면 사파리·맥/윈도우가 캘린더 앱을 바로 띄운다.
//   안드로이드: .ics를 내려주면 "다운로드 완료" 알림만 뜨고, 그걸 눌러 앱을 고르는
//               단계를 한 번 더 거쳐야 한다. 그마저 캘린더 앱이 .ics를 못 받는 기기가
//               있어서 사실상 추가가 안 됐다.
// 그래서 안드로이드에서는 구글 캘린더의 "일정 만들기" 화면을 값이 채워진 채로 연다.
// 앱이 깔려 있으면 앱이, 없으면 웹이 열리고 저장만 누르면 끝난다.
function pad2(n) {
  return String(n).padStart(2, '0')
}

function toIcsDate(dateStr) {
  return dateStr.replaceAll('-', '')
}

function escapeIcsText(text) {
  // 기본 파라미터(text = '')는 인자가 undefined일 때만 적용되고 null에는 안 먹히는데,
  // event.description 등 DB의 nullable 필드는 null로 넘어오는 경우가 흔하다 (?? 로 둘 다 처리).
  return (text ?? '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n')
}

// 파일명에 쓸 수 없는 문자를 정리한다 — 행사명에 ':'(예: "명조:워더링 웨이브 …")나
// '/'가 들어있는 경우가 흔한데, 그대로 download 속성에 넣으면 브라우저·OS마다
// 제각각으로 잘리거나 치환된다.
function toSafeFileName(title) {
  return (title ?? 'event')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'event'
}

// 종일 일정의 종료일은 "마지막 날 다음날"이어야 캘린더가 마지막 날까지 포함해서 보여준다.
// .ics의 DTEND와 구글 캘린더의 dates= 둘 다 같은 규칙이라 한 군데서 만든다.
function exclusiveEndDate(endDate) {
  const end = new Date(`${endDate}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return `${end.getFullYear()}${pad2(end.getMonth() + 1)}${pad2(end.getDate())}`
}

export function isAndroid() {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

// 버튼에 쓸 이름. 안드로이드는 파일을 받는 게 아니라 구글 캘린더가 열리므로
// "(.ics)"를 붙이면 거짓말이 된다.
export function calendarButtonLabel() {
  return isAndroid() ? '📅 캘린더에 추가' : '📅 캘린더에 추가 (.ics)'
}

function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title ?? '행사',
    dates: `${toIcsDate(event.startDate)}/${exclusiveEndDate(event.endDate)}`,
    location: [event.venue, event.venueAddress].filter(Boolean).join(' '),
    details: [event.description, typeof window !== 'undefined' ? window.location.href : null]
      .filter(Boolean)
      .join('\n\n'),
    ctz: 'Asia/Seoul',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

// 기기에 맞는 방법으로 캘린더에 추가한다. 클릭 핸들러에서 바로 불러야 한다
// (사용자 동작 없이 창을 열면 팝업 차단에 걸린다).
export function addEventToCalendar(event) {
  if (isAndroid()) {
    window.open(googleCalendarUrl(event), '_blank', 'noopener,noreferrer')
    return
  }
  downloadEventIcs(event)
}

export function downloadEventIcs(event) {
  const dtEnd = exclusiveEndDate(event.endDate)

  const now = new Date()
  const dtStamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//game-event-hub//KO',
    'BEGIN:VEVENT',
    `UID:${event.id}@game-event-hub`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${toIcsDate(event.startDate)}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText([event.venue, event.venueAddress].filter(Boolean).join(' '))}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${toSafeFileName(event.title)}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
