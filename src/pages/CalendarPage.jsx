import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import CategoryBadge from '../components/CategoryBadge'
import { categoryMeta, CATEGORIES } from '../data/events'
import { useEvents } from '../hooks/useEvents'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 목록 한 줄. 날짜를 고른 목록에서는 날짜가 뻔하지만("9월 11일 행사"), 이 달 전체
// 목록에서는 언제인지가 가장 중요한 정보라 showDate로 날짜를 같이 보여준다.
function EventRow({ event, showDate = false }) {
  const dateLabel = event.startDate === event.endDate
    ? event.startDate?.slice(5).replace('-', '.')
    : `${event.startDate?.slice(5).replace('-', '.')} ~ ${event.endDate?.slice(5).replace('-', '.')}`

  return (
    <Link
      to={`/events/${event.id}`}
      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors"
    >
      <span className="text-2xl shrink-0">{categoryMeta(event.category).emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{event.title}</p>
        <p className="text-xs text-zinc-400 truncate">
          {showDate ? `${dateLabel} · ${event.venue ?? ''}` : event.venue}
        </p>
      </div>
      <CategoryBadge category={event.category} />
    </Link>
  )
}

export default function CalendarPage() {
  useDocumentTitle('캘린더')
  const { events, loading, error } = useEvents()
  const [viewDate, setViewDate] = useState(new Date())

  function getEventsForDay(date) {
    const d = format(date, 'yyyy-MM-dd')
    return events.filter(e => e.startDate <= d && e.endDate >= d)
  }

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = getDay(monthStart) // 0=일

  const [selectedDay, setSelectedDay] = useState(null)
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : []
  const eventListRef = useRef(null)

  // 날짜를 고르기 전에 보여줄 "이 달 행사" 목록. 예전엔 안내 문구만 띄웠는데,
  // PC에서는 오른쪽 절반이 통째로 비어 보였고 모바일에서는 달력 아래에 아무것도 없어서
  // 날짜를 하나씩 눌러보기 전에는 그 달에 무슨 행사가 있는지 알 수가 없었다.
  const viewMonth = format(viewDate, 'yyyy-MM')
  const monthEvents = events
    .filter(e => (e.startDate ?? '') .slice(0, 7) <= viewMonth && (e.endDate ?? e.startDate ?? '').slice(0, 7) >= viewMonth)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))

  function selectDay(day) {
    setSelectedDay(prev => {
      const same = prev && format(prev, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
      return same ? null : day
    })
    // 모바일에서 날짜 선택 시 이벤트 목록으로 스크롤
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        eventListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    setSelectedDay(null)
  }
  function goToday() {
    setViewDate(new Date())
    setSelectedDay(null)
  }

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">행사 달력</h1>
        <p className="text-sm lg:text-base text-zinc-400">날짜를 선택해 행사를 확인하세요</p>
      </div>

      <div className="lg:grid lg:grid-cols-[420px_1fr] lg:gap-8 lg:items-start">
        <div>
          {/* 월 내비게이션 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              aria-label="이전 달"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ‹
            </button>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">
                {format(viewDate, 'yyyy년 M월', { locale: ko })}
              </span>
              {/* 다른 달을 보다가 이번 달로 돌아올 방법이 없어서 화살표를 여러 번 눌러야 했다 */}
              {!isSameMonth(viewDate, new Date()) && (
                <button
                  onClick={goToday}
                  className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors"
                >
                  오늘
                </button>
              )}
            </div>
            <button
              onClick={nextMonth}
              aria-label="다음 달"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ›
            </button>
          </div>

          {loading && (
            <p className="text-center text-sm text-zinc-400 py-4">행사 정보를 불러오는 중...</p>
          )}
          {error && (
            <p className="text-center text-sm text-red-400 py-4">행사 정보를 불러오지 못했습니다</p>
          )}

          {/* 달력 그리드 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-4">
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 border-b border-white/10">
              {DOW.map((d, i) => (
                <div key={d} className={`py-2 text-center text-xs font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-zinc-400'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 칸 */}
            <div className="grid grid-cols-7">
              {/* 앞 패딩 */}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}

              {days.map(day => {
                const dayEvents = getEventsForDay(day)
                const isSelected = selectedDay && format(selectedDay, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                const today = isToday(day)
                const inMonth = isSameMonth(day, viewDate)
                const dow = getDay(day)

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => selectDay(day)}
                    aria-pressed={!!isSelected}
                    // 스크린리더에는 숫자만 읽혀서 무슨 날짜인지, 행사가 있는지 알 수 없었다
                    aria-label={`${format(day, 'M월 d일 (eee)', { locale: ko })}${
                      dayEvents.length > 0 ? `, 행사 ${dayEvents.length}건` : ', 행사 없음'
                    }`}
                    className={`aspect-square flex flex-col items-center justify-start pt-1.5 px-1 relative transition-colors border border-transparent ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500/50'
                        : 'hover:bg-white/5'
                    } ${!inMonth ? 'opacity-30' : ''}`}
                  >
                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      today ? 'bg-indigo-600 text-white' :
                      dow === 0 ? 'text-red-400' :
                      dow === 6 ? 'text-blue-400' :
                      'text-zinc-300'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                        {dayEvents.slice(0, 3).map(e => (
                          <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${categoryMeta(e.category).dotClass}`} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 범례 */}
          <div className="flex gap-4 mb-6 lg:mb-0 text-xs text-zinc-400">
            {Object.values(CATEGORIES).map(category => (
              <span key={category} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full inline-block ${categoryMeta(category).dotClass}`} />
                {category}
              </span>
            ))}
          </div>
        </div>

        {/* 선택된 날 행사 목록 — PC에서는 달력 옆에 sticky 사이드 패널로 */}
        <div ref={eventListRef} className="mt-6 lg:mt-0 lg:sticky lg:top-20">
          {selectedDay ? (
            <div>
              <h2 className="text-sm lg:text-base font-semibold text-white mb-3">
                {format(selectedDay, 'M월 d일 (eee)', { locale: ko })} 행사
              </h2>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-zinc-400 py-4 text-center">이 날 행사가 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(event => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-sm lg:text-base font-semibold text-white mb-3">
                {format(viewDate, 'M월', { locale: ko })} 행사 {monthEvents.length}건
              </h2>
              {monthEvents.length === 0 ? (
                <p className="text-sm text-zinc-400 py-8 text-center bg-white/5 border border-white/10 rounded-2xl">
                  이 달에 등록된 행사가 없습니다
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {monthEvents.map(event => (
                      <EventRow key={event.id} event={event} showDate />
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-3">날짜를 누르면 그 날 행사만 볼 수 있어요</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
