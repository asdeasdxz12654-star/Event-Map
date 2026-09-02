// 행사를 .ics 파일로 내보낸다. 구글 캘린더 등에서 "가져오기"로 열 수 있다.
function pad2(n) {
  return String(n).padStart(2, '0')
}

function toIcsDate(dateStr) {
  return dateStr.replaceAll('-', '')
}

function escapeIcsText(text = '') {
  return text.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n')
}

export function downloadEventIcs(event) {
  // all-day 이벤트의 DTEND는 종료일 "다음날"이어야 캘린더 앱이 마지막 날까지 포함해서 보여준다
  const end = new Date(`${event.endDate}T00:00:00`)
  end.setDate(end.getDate() + 1)
  const dtEnd = `${end.getFullYear()}${pad2(end.getMonth() + 1)}${pad2(end.getDate())}`

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
  a.download = `${event.title}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
