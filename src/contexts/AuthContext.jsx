import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [therapist, setTherapist] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setTherapist(null); return }
    supabase.from('therapists').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setTherapist(data))
  }, [session])

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signUp  = (email, password, full_name) => supabase.auth.signUp({
    email, password, options: { data: { full_name } },
  })
  const signOut = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider value={{ session, therapist, loading, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
