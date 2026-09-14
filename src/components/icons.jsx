// 화면 전체에서 쓰는 아이콘.
//
// 예전엔 이모지(📅 📍 💰 🎟 ⭐ 🔍 ⚙ …)를 아이콘 대신 썼다. 이모지는
//   1) 기기·OS마다 글립 모양·크기·기준선이 달라 줄맞춤이 흔들리고
//   2) 색이 글립에 박혀 있어서 테마(다크/라이트)에 맞출 수 없고
//   3) 알록달록한 이모지가 한 화면에 스무 개쯤 뜨면 정작 강조해야 할
//      "예매하기" 버튼이 묻힌다.
// 그래서 선 아이콘으로 바꿨다. 색은 currentColor를 따르므로 글자색만 정하면 된다.
//
// 라이브러리를 넣지 않은 이유: 스무 개 남짓이라 path만 적는 게 더 가볍고,
// 굵기(1.6)와 크기 규칙을 우리가 직접 통제할 수 있다.
//
// 크기는 두 가지만 쓴다 — 16px(본문 인라인), 20px(버튼). className으로 준다.
//   <Icon name="calendar" className="w-4 h-4" />

const PATHS = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6Z" />
      <path d="M14 7v10" strokeDasharray="2 2.6" />
    </>
  ),
  // 원화. 통화 기호를 글자로 쓰면 폰트마다 폭이 달라 줄이 어긋난다.
  won: (
    <>
      <path d="M4 8l3.2 9L12 9.4 16.8 17 20 8" />
      <path d="M3 11.4h18" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 19c0-3.1 2.7-5 6-5s6 1.9 6 5" />
      <path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 14.6c1.7.7 2.8 2.2 2.8 4.4" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.05 5.9L12 17l-5.25 2.8L7.8 13.9 3.5 9.8l5.9-.8Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3.5m0 0L8.5 7M12 3.5 15.5 7" />
      <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </>
  ),
  back: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  expand: <path d="M9 4H4v5M15 20h5v-5M4 15v5h5M20 9V4h-5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
  // 톱니바퀴. 처음엔 원 + 방사형 선으로 그렸는데 해·밝기 아이콘처럼 보여서
  // 톱니 윤곽을 제대로 따는 형태로 바꿨다.
  gear: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warn: (
    <>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.5v5M12 8h.01" />
    </>
  ),
  // 공식에서 공개하지 않는 정보(DisclosureNote)
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6.2 6.2 11.6 11.6" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5h5v2" />
      <path d="M6.5 7 7.5 20h9l1-13" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
      <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11m0 0 4-4m-4 4-4-4" />
      <path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2M12 19.4v2M21.4 12h-2M4.6 12h-2M18.6 5.4 17.2 6.8M6.8 17.2l-1.4 1.4M18.6 18.6l-1.4-1.4M6.8 6.8 5.4 5.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />,
  list: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.6" />
      <path d="M11.6 12H20m-3 0v3m3.5-3v2.4" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m4.5 17 4.7-5 3.3 3.2 2.6-2.4 4.4 4.2" />
      <circle cx="9" cy="9.5" r="1.3" />
    </>
  ),
}

export default function Icon({ name, className = 'w-4 h-4', strokeWidth = 1.6, ...rest }) {
  const d = PATHS[name]
  // 이름을 잘못 적었을 때 화면이 깨지는 대신 아무것도 안 그린다.
  if (!d) return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // 아이콘은 거의 항상 옆의 글자를 보조하는 장식이다. 뜻을 담아야 하는 곳
      // (아이콘만 있는 버튼)은 버튼 쪽에 aria-label을 단다.
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {d}
    </svg>
  )
}

// 북마크처럼 "켜짐"을 면으로 보여줘야 하는 아이콘. 별 하나뿐이라 따로 둔다.
export function StarFilled({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.05 5.9L12 17l-5.25 2.8L7.8 13.9 3.5 9.8l5.9-.8Z" />
    </svg>
  )
}
