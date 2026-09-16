import { useCallback, useState } from 'react'

// 관리자 폼의 입력 상태.
//
// 이 세 줄이 여섯 파일에 열 번 복사돼 있었다 —
//   const [form, setForm] = useState(EMPTY)
//   const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
// 한 폼에 입력칸이 열 개씩 붙는 화면이 여럿이라 계속 늘어나던 모양이다.
//
// setForm을 그대로 함께 돌려준다. 폼을 통째로 비우거나(setForm(EMPTY)) 일부만 남기거나
// (setForm(p => ({ ...p, booth_id: p.booth_id }))), 파일 업로드처럼 이벤트가 아니라
// 값으로 바로 채워야 하는 경우가 있기 때문이다.
//
//   const [form, set, setForm] = useFormFields(EMPTY)
//   <input value={form.name} onChange={set('name')} />
export function useFormFields(initial) {
  const [form, setForm] = useState(initial)

  // set은 렌더마다 새로 만들 이유가 없다. 입력칸이 많은 폼에서 매번 새 핸들러가
  // 만들어지면 그만큼 불필요한 리렌더가 따라온다.
  const set = useCallback(
    field => e => setForm(prev => ({ ...prev, [field]: e.target.value })),
    []
  )

  return [form, set, setForm]
}
