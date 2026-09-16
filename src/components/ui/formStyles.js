// 관리자 입력칸의 생김새.
//
// 같은 클래스 문자열이 다섯 파일에 글자 하나까지 똑같이 복사돼 있었다
// (BoothCard·BoothItemRow·BoothList·CosplayerAdmin·StageAdmin).
// 토큰을 하나 바꾸려면 다섯 군데를 고쳐야 했고, 실제로 표면 토큰을 손볼 때마다
// 한 곳씩 빠뜨릴 뻔했다.

// 목록 안에 끼어 있는 좁은 입력칸 — 부스·항목·무대·코스어 폼이 쓴다.
export const ADMIN_INPUT =
  'bg-surface-2 border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-indigo-500'

// 행사 추가·수정 모달의 한 줄짜리 입력칸 — 폭을 다 쓰고 글자도 크다.
export const ADMIN_FIELD =
  'w-full bg-surface-2 border border-line focus:border-indigo-500 rounded-xl px-3 py-2 text-ink placeholder:text-zinc-600 focus:outline-none text-sm'
