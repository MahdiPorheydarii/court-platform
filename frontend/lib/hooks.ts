'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  api,
  gameToUpcoming,
  matchToOpenMatch,
  slotToCourtSlot,
} from './api'
import { API_ENABLED } from './config'
import {
  courtSlots as demoCourts,
  openMatches as demoMatches,
  upcomingGames as demoUpcoming,
  type CourtSlot,
  type OpenMatch,
  type UpcomingGame,
} from './club-data'
import { useSession } from './session'

/**
 * Gate an app page behind auth. Once the session has resolved, an unauthenticated
 * visitor is sent to /login. In local/demo mode (no API configured) it's a no-op
 * so the built-in demo data can be explored without a backend.
 */
export function useRequireAuth() {
  const session = useSession()
  const router = useRouter()
  useEffect(() => {
    if (!API_ENABLED) return
    if (!session.loading && !session.authed) router.replace('/login')
  }, [session.loading, session.authed, router])
  return session
}

/**
 * Discover feed. Fetches live open matches + available court slots for the
 * signed-in member. Shows a loading state until data arrives (never a flash of
 * demo data that then vanishes). Falls back to demo content only in local mode.
 */
export function useDiscoverData() {
  const { authed, loading: sessionLoading } = useSession()
  const [matches, setMatches] = useState<OpenMatch[]>([])
  const [courts, setCourts] = useState<CourtSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!API_ENABLED) {
      setMatches(demoMatches)
      setCourts(demoCourts)
      setLoading(false)
      return
    }
    if (sessionLoading) return
    if (!authed) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all([api.listMatches('open'), api.availability(undefined, 3)])
      .then(([ms, slots]) => {
        if (cancelled) return
        setMatches(ms.map(matchToOpenMatch))
        setCourts(slots.filter((s) => s.available).slice(0, 9).map(slotToCourtSlot))
      })
      .catch(() => {
        /* keep whatever we have; surfaced as an empty state, not a crash */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authed, sessionLoading, tick])

  return {
    matches,
    courts,
    loading: loading || (API_ENABLED && sessionLoading),
    refresh: () => setTick((t) => t + 1),
  }
}

export function useMyGames(when: 'upcoming' | 'past') {
  const { authed, loading: sessionLoading } = useSession()
  const [games, setGames] = useState<UpcomingGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!API_ENABLED) {
      setGames(when === 'upcoming' ? demoUpcoming : [])
      setLoading(false)
      return
    }
    if (sessionLoading) return
    if (!authed) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .myGames(when)
      .then((rows) => {
        if (!cancelled) setGames(rows.map(gameToUpcoming))
      })
      .catch(() => {
        if (!cancelled) setGames([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authed, sessionLoading, when])

  return { games, loading: loading || (API_ENABLED && sessionLoading) }
}
