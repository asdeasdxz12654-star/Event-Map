import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = 아직 로딩 중

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // BASE_URL(vite.config의 base와 동일, 예: '/Event-Map/')을 껴서 조합해야 GitHub Pages
  // 서브패스 배포에서도 실제 앱이 있는 경로로 돌아온다 — origin만 쓰면 서브패스가 빠져
  // 사이트 루트(존재하지 않는 경로)로 리다이렉트되어 404가 난다.
  const signInWithGoogle = (redirectPath = '/') =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}${redirectPath.replace(/^\//, '')}` },
    })

  const signOut = () => supabase.auth.signOut()

  return { user, loading: user === undefined, signInWithGoogle, signOut }
}
