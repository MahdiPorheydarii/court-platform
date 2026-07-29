'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api, getToken, type ApiClub, type ApiMember } from './api'
import { API_ENABLED, TOKEN_KEY } from './config'

interface SessionState {
  token: string | null
  member: ApiMember | null
  club: ApiClub | null
  loading: boolean
  authed: boolean
  login: (token: string, member: ApiMember, club: ApiClub) => void
  logout: () => void
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [member, setMember] = useState<ApiMember | null>(null)
  const [club, setClub] = useState<ApiClub | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = getToken()
    if (!t || !API_ENABLED) {
      setLoading(false)
      return
    }
    setToken(t)
    api
      .me(t)
      .then(({ member, club }) => {
        setMember(member)
        setClub(club)
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((t: string, m: ApiMember, c: ApiClub) => {
    window.localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setMember(m)
    setClub(c)
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMember(null)
    setClub(null)
  }, [])

  const value = useMemo<SessionState>(
    () => ({ token, member, club, loading, authed: Boolean(token), login, logout }),
    [token, member, club, loading, login, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    // Allows components to render outside the provider (e.g. static demo pages).
    return {
      token: null,
      member: null,
      club: null,
      loading: false,
      authed: false,
      login: () => {},
      logout: () => {},
    }
  }
  return ctx
}
