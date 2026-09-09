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

  const authenticate = useCallback(async (password) => {
    let res
    try {
      res = await fetch(`${BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch {
      return false // 네트워크 오류 — 로그인 폼에서 "코드가 올바르지 않습니다"로 뭉뚱그려 표시됨
    }
    if (!res.ok) return false
    const { token } = await res.json()
    if (!token) return false
    sessionStorage.setItem(TOKEN_KEY, token)
    setToken(token)
    return true
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  return <Ctx.Provider value={{ isAdmin: !!token, authenticate, logout }}>{children}</Ctx.Provider>
}

export const useAdmin = () => useContext(Ctx)
export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY) ?? ''
