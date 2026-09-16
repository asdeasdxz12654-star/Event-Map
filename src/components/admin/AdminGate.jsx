import { useState } from 'react'
import Icon from '../icons'
import AdminModal from '../AdminModal'
import { useAdmin } from '../../contexts/AdminContext'
import { FOCUS_RING } from '../ui/focusRing'

// /admin/* 화면의 문지기.
//
// 왜 컴포넌트로 빼는가
//   지금까지 관리자 전용 화면은 /admin/drafts 한 장이었고, 그 페이지가 자기 안에서
//   직접 로그인 검사를 했다(early return 세 번). 화면이 늘어나면 그 세 덩어리가 화면
//   수만큼 복제되고, 한 곳을 고칠 때 나머지를 빠뜨리게 된다. 문은 하나만 만든다.
//
// 로그인은 사이트 전체와 같은 관리자 코드 하나다.
//   예전엔 이 화면만 구글 로그인(Supabase Auth)을 썼다. 나머지 관리 기능은 전부
//   Worker의 관리자 코드를 쓰는데도 그랬다. 두 로그인이 따로 놀아서, 한쪽만 로그인한
//   상태에서는 검수 목록이 오류 없이 그냥 비어 보였다 — RLS는 권한이 없을 때 에러가
//   아니라 빈 배열을 주기 때문이다. "없는 것"과 "못 보는 것"이 화면에서 같아 보였다.
//
// 이 문은 화면을 가릴 뿐 보안 경계가 아니다. 실제 경계는 Worker다(토큰 검증 +
// service_role). 번들을 뜯어 이 컴포넌트를 건너뛰어도 API가 401을 준다.
export default function AdminGate({ title = '관리자', children }) {
  const { isAdmin } = useAdmin()
  const [showLogin, setShowLogin] = useState(false)

  if (isAdmin) return children

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <Icon name="key" className="w-12 h-12 mx-auto mb-4 text-zinc-500" />
      <h1 className="text-xl font-bold text-ink mb-2">{title}</h1>
      <p className="text-zinc-400 text-sm mb-8">
        관리자만 볼 수 있는 화면입니다. 관리자 코드를 입력해 주세요.
      </p>
      <button
        type="button"
        onClick={() => setShowLogin(true)}
        className={`px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors ${FOCUS_RING}`}
      >
        관리자 코드 입력
      </button>
      {showLogin && <AdminModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
