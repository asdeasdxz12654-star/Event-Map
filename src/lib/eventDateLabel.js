import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { parseLocalDate } from '../data/events'

// 목록 카드에 적는 행사 기간.
//
// 왜 연도를 조건부로 붙이나
//   목록은 "지난 1년 ~ 앞으로 1년"을 담는다(src/hooks/useEvents.js — 1월 1일에 작년
//   행사가 통째로 사라지는 걸 막기 위해서다). 그래서 같은 달이 목록에 두 번 나올 수
//   있는데, 카드에는 연도가 없었다.
//
//     종료 탭      2025-10-06 ~ 2026-10-05을 담는다. "10월 5일"이 어느 해인지 못 가린다.
//     예정 탭      연말에는 지평선이 해를 넘긴다. 12월에 보는 "1월 16일"은 내년이다.
//     접힌 줄      지평선 뒤는 전부 내년인데 그렇게 보이지 않았다.
//
//   그렇다고 늘 붙이면 올해 행사만 보이는 흔한 경우에 "2026년"이 카드마다 반복된다.
//   다를 때만 드러낸다 — 같은 화면의 월 필터 칩도 같은 규칙을 쓴다
//   (HomePage의 spansMultipleYears: 한 해 안이면 "9월", 해를 넘기면 "26.9월").
//
// 두 형식을 두는 이유
//   2열에서는 폭이 좁아 긴 형식의 끝이 잘렸다("11월 14일 ~ 11월 1…"). 요일은 실제로
//   계획에 쓰이는 정보라 두 형식 모두에 남긴다.
//
// 기간이 해를 넘기는 경우(12/30 ~ 1/2)는 시작 연도만 붙는다. 끝 연도까지 적으면
// 카드 한 줄에 안 들어가고, 이틀 뒤가 다음 해라는 건 날짜만 봐도 읽힌다.
export function eventDateLabel(event, { compact = false, today = new Date() } = {}) {
  if (!event?.startDate) return ''

  const start = parseLocalDate(event.startDate)
  const end = parseLocalDate(event.endDate ?? event.startDate)
  const isSameDay = event.startDate === (event.endDate ?? event.startDate)

  const startYear = start.getFullYear()
  const showYear = startYear !== today.getFullYear()

  if (compact) {
    const prefix = showYear ? `${String(startYear).slice(2)}.` : ''
    return isSameDay
      ? `${prefix}${format(start, 'M.d (eee)', { locale: ko })}`
      : `${prefix}${format(start, 'M.d', { locale: ko })} – ${format(end, 'M.d (eee)', { locale: ko })}`
  }

  const prefix = showYear ? `${startYear}년 ` : ''
  return isSameDay
    ? `${prefix}${format(start, 'M월 d일 (eee)', { locale: ko })}`
    : `${prefix}${format(start, 'M월 d일', { locale: ko })} ~ ${format(end, 'M월 d일 (eee)', { locale: ko })}`
}
