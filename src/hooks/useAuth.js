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

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/cosplayers/register` },
    })

  const signOut = () => supabase.auth.signOut()

  return { user, loading: user === undefined, signInWithGoogle, signOut }
}
