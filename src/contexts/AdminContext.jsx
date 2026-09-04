import { createContext, useCallback, useContext, useState } from 'react'

const _h = 'f38cee11061a9f4c29b75f7df854ef58b0a8a8670e69eec28c279e9ef2b475a9'
const _s = '__am'
const _t = '__at'

async function _d(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
}

const Ctx = createContext(null)

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem(_s) === '1')

  const authenticate = useCallback(async (pw) => {
    const d = await _d(pw)
    if (d !== _h) return false
    sessionStorage.setItem(_s, '1')
    sessionStorage.setItem(_t, d)
    setIsAdmin(true)
    return true
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(_s)
    sessionStorage.removeItem(_t)
    setIsAdmin(false)
  }, [])

  return <Ctx.Provider value={{ isAdmin, authenticate, logout }}>{children}</Ctx.Provider>
}

export const useAdmin = () => useContext(Ctx)
export const getAdminToken = () => sessionStorage.getItem(_t) ?? ''
