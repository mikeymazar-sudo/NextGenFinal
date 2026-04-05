'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { UserProfile } from '@/types/schema'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: User | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const fetchedProfileUserIdRef = useRef<string | null>(null)
  const inFlightProfileUserIdRef = useRef<string | null>(null)
  const inFlightProfileRequestRef = useRef<Promise<void> | null>(null)

  const getSupabase = useCallback(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return null
    }

    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }

    return supabaseRef.current
  }, [])

  const fetchProfile = useCallback(async (userId: string, { force = false }: { force?: boolean } = {}) => {
    const supabase = getSupabase()

    if (!supabase) {
      return
    }

    if (!force) {
      if (fetchedProfileUserIdRef.current === userId) {
        return
      }

      if (
        inFlightProfileRequestRef.current &&
        inFlightProfileUserIdRef.current === userId
      ) {
        await inFlightProfileRequestRef.current
        return
      }
    }

    const profileRequest = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('Profile fetch error:', error.message)
          return
        }

        setProfile((data as UserProfile | null) ?? null)
        fetchedProfileUserIdRef.current = userId
      } catch (err) {
        console.error('Profile fetch exception:', err)
      } finally {
        if (inFlightProfileRequestRef.current === profileRequest) {
          inFlightProfileRequestRef.current = null
          inFlightProfileUserIdRef.current = null
        }
      }
    })()

    inFlightProfileUserIdRef.current = userId
    inFlightProfileRequestRef.current = profileRequest

    await profileRequest
  }, [getSupabase])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id, { force: true })
    }
  }, [user, fetchProfile])

  useEffect(() => {
    const supabase = getSupabase()
    let mounted = true

    if (!supabase) {
      return () => {
        mounted = false
      }
    }

    const syncAuth = async () => {
      try {
        const {
          data: { user: currentUser },
          error,
        } = await supabase.auth.getUser()

        if (!mounted) {
          return
        }

        if (error && !/auth session missing/i.test(error.message)) {
          console.error('Auth sync error:', error.message)
        }

        setUser(currentUser ?? null)

        if (currentUser) {
          void fetchProfile(currentUser.id)
        } else {
          fetchedProfileUserIdRef.current = null
          inFlightProfileUserIdRef.current = null
          inFlightProfileRequestRef.current = null
          setSession(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth sync exception:', err)
      }
    }

    void syncAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted || event === 'INITIAL_SESSION') return

        setSession(newSession)
        setUser(newSession?.user ?? null)
        setLoading(false)

        if (newSession?.user) {
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            void fetchProfile(newSession.user.id, {
              force: event === 'USER_UPDATED',
            })
          }
        } else {
          fetchedProfileUserIdRef.current = null
          inFlightProfileUserIdRef.current = null
          inFlightProfileRequestRef.current = null
          setProfile(null)
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, getSupabase])

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase()

    if (!supabase) {
      return { error: 'Missing Supabase configuration.' }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (!error) {
      setSession(data.session ?? null)
      setUser(data.user ?? null)

      if (data.user) {
        void fetchProfile(data.user.id)
      }
    }

    return { error: error?.message || null }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    const supabase = getSupabase()

    if (!supabase) {
      return { error: 'Missing Supabase configuration.' }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error?.message || null }
  }

  const handleSignOut = async () => {
    const supabase = getSupabase()

    if (supabase) {
      await supabase.auth.signOut()
    }

    fetchedProfileUserIdRef.current = null
    inFlightProfileUserIdRef.current = null
    inFlightProfileRequestRef.current = null
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut: handleSignOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
