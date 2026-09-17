import { useEffect, useRef } from 'react'

// 모달이 갖춰야 할 것들을 한 곳에서 처리한다.
//
//   · 열려 있는 동안 뒤 배경이 스크롤되지 않게 잠근다
//   · Esc로 닫힌다
//   · 탭 키가 모달 밖으로 나가지 않는다 (포커스 트랩)
//   · 닫으면 열었던 버튼으로 포커스가 돌아간다
//
// 마지막 둘이 없으면 키보드나 스크린리더 사용자에게 모달은 "덮개"가 아니라 그냥
// 화면 위에 얹힌 그림이다. 탭을 누르면 포커스가 뒤에 깔린 목록으로 새어 나가는데,
// 보이는 건 여전히 모달이라 지금 어디를 짚고 있는지 알 수 없다. 닫은 뒤에는
// 페이지 맨 위에서 처음부터 다시 내려와야 한다.
//
// Sheet.jsx가 이 네 가지를 제대로 하고 있었고 나머지 모달 여섯은 앞의 둘만 하고
// 있었다. 여섯 곳에 같은 코드를 복사하는 대신 Sheet에 있던 것을 여기로 옮겼다.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 열려 있는 모달들. 마지막이 맨 위다.
//
// 모달은 겹칠 수 있다 — 설정 위에 관리자 로그인, 설정 위에 홈 화면 추가 안내.
// 겹쳤을 때 Esc 한 번에 둘 다 닫히면 안 된다(실제로 그랬다. 관리자 코드를 잘못 쳐서
// Esc를 누르면 설정까지 통째로 닫혔다). 키는 맨 위 모달만 처리한다.
const stack = []

function isTop(token) {
  return stack[stack.length - 1] === token
}

// panelRef: 포커스를 가둘 요소. 덮개(overlay)가 아니라 내용이 든 패널을 가리켜야
//           한다 — 덮개를 가리키면 덮개 클릭으로 닫는 영역까지 트랩에 들어간다.
//           단, 덮개 자체가 곧 내용인 화면(사진 뷰어)은 덮개를 넘겨도 된다.
// onClose:  Esc를 눌렀을 때 부를 함수.
// initialFocusRef: 열리자마자 포커스를 둘 곳. 안 주면 모달 안 첫 요소로 간다.
//
//   autoFocus로 대신하지 않는 이유: React 19는 autoFocus를 DOM 속성으로 남기지 않고
//   자기가 직접 포커스를 옮기는데, 그 시점이 이 훅의 이펙트보다 늦을 수 있다. 그러면
//   훅이 먼저 첫 요소(대개 닫기 버튼)를 잡아버린다. 실제로 관리자 로그인 창에서
//   비밀번호 칸 대신 닫기 버튼에 포커스가 갔다. 어느 쪽이 이길지 순서에 맡기지 말고
//   한 군데서 정한다.
export function useModalDialog(panelRef, onClose, { initialFocusRef } = {}) {
  // onClose는 호출부에서 대개 인라인 화살표 함수로 온다 — 부모가 다시 그릴 때마다
  // 새 함수가 되므로, 이걸 의존성에 넣으면 아래 이펙트가 매 렌더 다시 돈다. 그러면
  // 정리 단계가 포커스를 모달 밖(열었던 버튼)으로 보내고 설정 단계가 다시 모달 안
  // 첫 요소로 가져와서, 모달 안에서 스위치 하나 누를 때마다 포커스가 튄다.
  // 실제로 홈 필터 시트에서 "매진 숨기기"를 켜면 그 자리에서 포커스를 잃었다.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // 열었던 요소를 **첫 렌더에서** 붙잡는다. 이펙트에서 읽으면 늦다 —
  // autoFocus가 달린 요소(사진 뷰어의 닫기 버튼, 관리자 로그인 입력칸)는 이펙트보다
  // 먼저 포커스를 가져가므로, 그때 document.activeElement를 읽으면 "열었던 버튼"이
  // 아니라 모달 자기 안쪽을 가리킨다. 그 요소는 닫을 때 같이 사라지니 되돌릴 곳이
  // 없어지고, 포커스는 body로 떨어져 탭이 페이지 맨 위에서 다시 시작한다.
  // (실제로 포스터 전체 보기에서 그랬다. 트랩은 도는데 복귀만 조용히 안 됐다.)
  const openerRef = useRef(null)
  if (openerRef.current === null) openerRef.current = document.activeElement

  useEffect(() => {
    const token = {}
    stack.push(token)

    const opener = openerRef.current

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      // 겹쳐 있을 때 맨 위가 아니면 아무것도 하지 않는다.
      if (!isTop(token)) return

      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return

      const items = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (!items?.length) {
        // 누를 것이 하나도 없는 모달이라도 탭이 뒤로 새면 안 된다.
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      // 포커스가 이미 모달 밖에 있으면(뒤 배경을 클릭했다거나) 안쪽으로 되돌린다.
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    // 열리자마자 모달 안으로 포커스를 옮긴다.
    const panel = panelRef.current
    const wanted = initialFocusRef?.current
    if (wanted && panel?.contains(wanted)) wanted.focus()
    else panel?.querySelector(FOCUSABLE)?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const at = stack.indexOf(token)
      if (at > -1) stack.splice(at, 1)
      document.body.style.overflow = overflow
      // 열었던 버튼이 아직 화면에 있을 때만 되돌린다. 모달 안에서 그 버튼이 사라지는
      // 일이 있다(목록에서 지운 뒤 닫기) — 없어진 요소에 focus()를 부르면 포커스가
      // body로 떨어져서 탭이 페이지 맨 위에서 다시 시작한다.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
    // 의존성은 비워 둔다 — 열릴 때 한 번만 잠그고 닫힐 때 한 번만 되돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
