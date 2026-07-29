'use client'

import { useEffect, useState } from 'react'
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
 * Discover feed data. Falls back to the built-in demo world so the page always
 * looks alive; hydrates with live matches + open court slots when signed in.
 */
export function useDiscoverData() {
  const { authed } = useSession()
  const live = authed && API_ENABLED
  const [matches, setMatches] = useState<OpenMatch[]>(demoMatches)
  const [courts, setCourts] = useState<CourtSlot[]>(demoCourts)
  const [source, setSource] = useState<'demo' | 'live'>('demo')

  useEffect(() => {
    if (!live) return
    let cancelled = false
    Promise.all([api.listMatches('open'), api.availability(undefined, 3)])
      .then(([ms, slots]) => {
        if (cancelled) return
        if (ms.length) setMatches(ms.map(matchToOpenMatch))
        const open = slots.filter((s) => s.available).slice(0, 9)
        if (open.length) setCourts(open.map(slotToCourtSlot))
        setSource('live')
      })
      .catch(() => {
        /* keep demo data on failure */
      })
    return () => {
      cancelled = true
    }
  }, [live])

  return { matches, courts, source }
}

export function useMyGames(when: 'upcoming' | 'past') {
  const { authed } = useSession()
  const live = authed && API_ENABLED
  const [games, setGames] = useState<UpcomingGame[]>(when === 'upcoming' ? demoUpcoming : [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!live) {
      setGames(when === 'upcoming' ? demoUpcoming : [])
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
  }, [live, when])

  return { games, loading }
}
