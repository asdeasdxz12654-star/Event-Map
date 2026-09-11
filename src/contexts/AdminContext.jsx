import { createContext, useCallback, useContext, useState } from 'react'

// 관리자 로그인은 서버(Worker)가 처리한다 — 비밀번호 해시를 클라이언트 번들에 두지
// 않는다. 예전엔 SHA-256(비밀번호) 해시를 여기 하드코딩해두고 브라우저에서 직접
// 비교했는데, 그 해시가 공개 번들에 실리는 순간 누구나 네트워크 요청 없이(=속도
// 제한도 안 받고) 오프라인으로 크랙을 시도할 수 있어서 취약했다. 지금은 비밀번호를
// Worker로 보내 서버에서만 검증하고, 서명된 만료 토큰(24시간)만 돌려받는다 — 토큰만
// 봐서는 비밀번호를 알아낼 수 없고, 유출돼도 시간이 지나면 자동으로 무효화된다.
const BASE = import.meta.env.VITE_ADMIN_API_URL || 'https://event-map-api-proxy.asdeasdxz12654.workers.dev'
export const TOKEN_KEY = '__at'

const Ctx = createContext(null)

export function AdminProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY))

  // { ok, message } 를 돌려준다 — 실패 사유가 "코드가 틀림"뿐이 아니기 때문이다.
  // Worker가 로그인 시도 횟수를 제한하고 있어서(브루트포스 차단) 차단당한 동안은
  // 맞는 코드를 넣어도 막히는데, 이때 "코드가 올바르지 않습니다"라고만 보여주면
  // 관리자가 영문도 모르고 계속 재시도하게 된다.
  const authenticate = useCallback(async (password) => {
    let res
    try {
      res = await fetch(`${BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch {
      return { ok: false, message: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' }
    }
    if (res.status === 429) {
      const mins = Math.ceil(Number(res.headers.get('Retry-After') ?? 600) / 60)
      return { ok: false, message: `로그인 시도가 너무 많습니다. ${mins}분 뒤에 다시 시도해주세요.` }
    }
    // 501 = Worker에 ADMIN_PASSWORD_HASH/SESSION_SECRET 시크릿이 등록되지 않은 배포.
    // 코드가 틀렸다고 안내하면 맞는 코드를 몇 번이고 다시 넣어보게 된다.
    if (res.status === 501) {
      return { ok: false, message: '서버에 관리자 로그인이 설정되어 있지 않습니다. (Worker 시크릿 확인 필요)' }
    }
    if (!res.ok) return { ok: false, message: '관리자 코드가 올바르지 않습니다' }
    const { token } = await res.json().catch(() => ({}))
    if (!token) return { ok: false, message: '관리자 코드가 올바르지 않습니다' }
    sessionStorage.setItem(TOKEN_KEY, token)
    setToken(token)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  return <Ctx.Provider value={{ isAdmin: !!token, authenticate, logout }}>{children}</Ctx.Provider>
}

export const useAdmin = () => useContext(Ctx)
export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY) ?? ''
