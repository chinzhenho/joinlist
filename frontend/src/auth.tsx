import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, TOKEN_KEY, type User } from './api'

type Auth = {
  user: User | null
  ready: boolean
  signIn: (token: string, user: User) => void
  signOut: () => void
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(() => getToken() === null)

  useEffect(() => {
    if (!getToken()) return
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('joinlist:logout', onLogout)
    return () => window.removeEventListener('joinlist:logout', onLogout)
  }, [])

  // All tabs of one browser share the login. If another tab logs in, switches account or logs out,
  // follow it here too, so this tab never shows one name while acting as someone else.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return
      if (!e.newValue) setUser(null)
      else api.me().then(setUser).catch(() => setUser(null))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const signIn = useCallback((token: string, u: User) => {
    setToken(token)
    setUser(u)
  }, [])

  const signOut = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
