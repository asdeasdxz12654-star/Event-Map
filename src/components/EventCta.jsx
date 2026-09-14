import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './icons'
import { FOCUS_RING } from './ui/focusRing'
import { addEventToCalendar, calendarButtonLabel } from '../utils/ics'
import { ticketSiteName } from '../lib/ticketSite'

// 예매 버튼. 인라인 CTA와 하단 고정 바가 같은 것을 쓴다.
function TicketButton({ event, className }) {
  if (!event.ticketUrl) return null
  if (event.ticketStatus === 'soldout') {
    return (
      <div className={`flex items-center justify-center gap-2 bg-surface-2 text-zinc-400 font-semibold select-none ${className}`}>
        <Icon name="ticket" className="w-[18px] h-[18px]" />
        매진
      </div>
    )
  }
  const site = ticketSiteName(event.ticketUrl)
  return (
    <a
      href={event.ticketUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors ${FOCUS_RING} ${className}`}
    >
      <Icon name="ticket" className="w-[18px] h-[18px]" />
      {event.ticketStatus === 'available' ? '예매하기' : '예매 페이지'}
      {site && <span className="font-normal text-indigo-100">· {site}</span>}
    </a>
  )
}

// 공식 사이트. 주소를 아는 행사는 바로 열고, 모르는 행사는 행사명으로 검색 결과를 연다 —
// 예전엔 website가 없으면 버튼 자체가 사라져서 "공식 정보를 어디서 보나"가 막다른 길이었다.
function officialHref(event) {
  return event.website
    ?? `https://search.naver.com/search.naver?query=${encodeURIComponent(`${event.title} 공식`)}`
}

function SecondaryButton({ children, icon, ...rest }) {
  const cls = `flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-surface-1 hover:bg-surface-2 border border-line rounded-xl text-[11px] text-zinc-300 transition-colors ${FOCUS_RING}`
  if (rest.href) {
    return <a className={cls} target="_blank" rel="noopener noreferrer" {...rest}><Icon name={icon} className="w-[18px] h-[18px]" />{children}</a>
  }
  return <button type="button" className={cls} {...rest}><Icon name={icon} className="w-[18px] h-[18px]" />{children}</button>
}

// 주 행동 하나 + 보조 셋.
//
// 예전엔 예매·공식 사이트·캘린더·공유가 전부 같은 높이의 풀폭 버튼으로 세로로 쌓여
// 있었다. 주 행동이 하나인데 화면에는 네 개로 보였다. 보조 셋은 아이콘 + 짧은 이름으로
// 한 줄에 묶어 주 버튼과 무게를 벌린다.
// withBar=false로 두는 곳: PC 전용 기둥에 놓인 인스턴스.
// 이 화면은 CTA를 두 번 렌더한다 — 넓은 화면에서는 왼쪽 기둥에, 좁은 화면에서는
// 본문 흐름 안에(제목·핵심 정보 다음에) 놓여야 하는데, 하나만 두면 둘 중 한쪽에서
// 순서가 어그러지기 때문이다. 서로 반대 조건으로 숨겨지므로 화면에는 언제나 하나만 보인다.
// 다만 숨겨진 쪽은 "화면 밖"으로 판정되므로, 그쪽이 하단 바를 띄우지 않도록 꺼둔다.
export default function EventCta({ event, withBar = true }) {
  const anchorRef = useRef(null)
  const [barVisible, setBarVisible] = useState(false)

  // 하단 고정 바는 "본문의 예매 버튼이 화면 밖으로 나갔을 때"만 뜬다.
  // 예전엔 예매 링크가 있으면 상시 떠 있었고, 대신 본문 CTA에서 예매 버튼을 빼는
  // 분기(showTicketBar)를 호출부가 들고 있었다. 같은 버튼이 두 번 보이지 않게 하려던
  // 처리인데, 어느 쪽이 보이는지 코드만 봐서는 알기 어려웠다.
  const showBar = withBar && !!event.ticketUrl && event.ticketStatus !== 'soldout'

  useEffect(() => {
    const el = anchorRef.current
    if (!el || !showBar) return
    const io = new IntersectionObserver(
      ([entry]) => setBarVisible(!entry.isIntersecting),
      { rootMargin: '-8px 0px 0px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [showBar, event.id])

  return (
    <>
      <div ref={anchorRef} className="flex flex-col gap-2">
        <TicketButton event={event} className="w-full py-3.5 rounded-2xl text-sm" />
        <div className="grid grid-cols-3 gap-2">
          <SecondaryButton icon="external" href={officialHref(event)}>
            {event.website ? '공식 사이트' : '공식 정보 검색'}
          </SecondaryButton>
          <SecondaryButton icon="calendar" onClick={() => addEventToCalendar(event)}>
            {calendarButtonLabel()}
          </SecondaryButton>
          <ShareButton event={event} />
        </div>
      </div>

      {/* 부스·출연진·지도까지 붙는 행사는 스크롤이 길어져서 예매하기가 화면 밖으로
          사라진다. PC에서는 왼쪽 기둥이 따라 내려오므로 필요 없다. */}
      {showBar && barVisible && createPortal(
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-fade-in">
          <TicketButton event={event} className="w-full py-3 rounded-xl text-sm" />
        </div>,
        document.body
      )}
    </>
  )
}

function ShareButton({ event }) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} | 게임이벤트허브`, url })
      } catch {
        // 사용자가 취소한 경우 무시
      }
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // clipboard API 미지원 환경
      }
    }
  }, [event.title])

  return (
    <SecondaryButton icon={copied ? 'check' : 'share'} onClick={handleShare}>
      {copied ? '복사됨' : '공유'}
    </SecondaryButton>
  )
}
