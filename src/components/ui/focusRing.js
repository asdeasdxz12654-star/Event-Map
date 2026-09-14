// 키보드로 이동했을 때만 보이는 포커스 링.
//
// 예전엔 카드 링크에만 붙어 있어서, 탭 키로 필터를 넘기면 지금 어디에 있는지
// 알 수 없었다. 모든 컨트롤이 같은 링을 쓰도록 한 곳에 모아둔다.
// (:focus가 아니라 :focus-visible이라 마우스로 눌렀을 때는 안 뜬다.)
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 focus:outline-none'

// 아이콘만 있는 작은 버튼은 보이는 크기가 그대로 누를 수 있는 크기가 된다.
// 손가락으로 누르려면 최소 44×44가 필요하다 — 보이는 크기는 그대로 두고
// 가상 요소로 누를 수 있는 영역만 넓힌다.
export const TAP_TARGET =
  'relative after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-11 after:h-11 after:content-[""]'
