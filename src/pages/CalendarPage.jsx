import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday } from 'date-fns'
import { ko } from 'date-fns/locale'
import CategoryBadge from '../components/CategoryBadge'
import { useEvents } from '../hooks/useEvents'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarPage() {
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
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ‹
            </button>
            <span className="text-white font-semibold">
              {format(viewDate, 'yyyy년 M월', { locale: ko })}
            </span>
            <button
              onClick={nextMonth}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            >
              ›
            </button>
          </div>

          {loading && (
            <p className="text-center text-sm text-zinc-500 py-4">행사 정보를 불러오는 중...</p>
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
                          <div
                            key={e.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              e.category === '게임전시' ? 'bg-violet-400' :
                              e.category === '코스프레' ? 'bg-pink-400' : 'bg-amber-400'
                            }`}
                          />
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
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />게임전시</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />코스프레</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />게임음악</span>
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
                <p className="text-sm text-zinc-500 py-4 text-center">이 날 행사가 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(event => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 transition-colors"
                    >
                      <span className="text-2xl">
                        {event.category === '게임전시' ? '🎮' : event.category === '코스프레' ? '✨' : '🎵'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{event.title}</p>
                        <p className="text-xs text-zinc-400">{event.venue}</p>
                      </div>
                      <CategoryBadge category={event.category} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center text-center gap-2 text-sm text-zinc-500 bg-white/5 border border-white/10 rounded-2xl p-8 min-h-[200px]">
              <span className="text-3xl">📅</span>
              <span>날짜를 선택하면<br />그 날의 행사를 보여드려요</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
