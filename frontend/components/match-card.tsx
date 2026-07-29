'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, MapPin, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/avatar-stack'
import { api, ApiError } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { levelTone, type OpenMatch, type Player } from '@/lib/club-data'

const you: Player = {
  id: 'you',
  name: 'You',
  initials: 'YOU',
  level: 'Intermediate',
  tone: 'bg-foreground text-background',
}

function SportBadge({ sport }: { sport: OpenMatch['sport'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
      {sport}
    </span>
  )
}

export function MatchCard({ match }: { match: OpenMatch }) {
  const { authed } = useSession()
  const router = useRouter()
  const [joined, setJoined] = useState(false)
  const [players, setPlayers] = useState(match.players)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const spotsLeft = match.spotsTotal - players.length
  const isLive = API_ENABLED && match.id.includes('-') && match.id.length >= 32

  function handleJoin() {
    if (joined || spotsLeft <= 0) return
    // Logged-out visitors (e.g. on the landing preview) are sent to sign in.
    if (API_ENABLED && !authed) {
      router.push('/login')
      return
    }
    setError(null)
    // Optimistic: reflect the join immediately.
    setJoined(true)
    setPlayers((prev) => [...prev, you])

    startTransition(async () => {
      if (!isLive) {
        await new Promise((r) => setTimeout(r, 600)) // demo mode
        return
      }
      try {
        await api.joinMatch(match.id)
      } catch (e) {
        setJoined(false)
        setPlayers(match.players)
        setError(
          e instanceof ApiError ? e.message : 'Could not join — that spot was just taken.',
        )
      }
    })
  }

  const currentSpotsLeft = joined
    ? match.spotsTotal - players.length
    : spotsLeft

  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-center justify-between">
        <SportBadge sport={match.sport} />
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            levelTone(match.level),
          )}
        >
          {match.level}
        </span>
      </div>

      <h3 className="mt-3 font-serif text-xl font-semibold tracking-tight">
        {match.title}
      </h3>

      <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          {match.club} · {match.court}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          {match.day}, {match.time} · {match.durationMins} min
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <AvatarStack
          players={players}
          emptySpots={Math.max(currentSpotsLeft, 0)}
          size="sm"
        />
        <span className="text-xs text-muted-foreground">
          {currentSpotsLeft > 0 ? (
            <>
              <span className="font-semibold text-foreground">
                {players.length} joined
              </span>{' '}
              · {currentSpotsLeft} spot{currentSpotsLeft > 1 ? 's' : ''} left
            </>
          ) : (
            <span className="font-semibold text-accent">Match is full</span>
          )}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="font-serif text-lg font-semibold">
            ${match.pricePerPerson}
          </p>
          <p className="text-xs text-muted-foreground">per person · split</p>
        </div>

        <Button
          onClick={handleJoin}
          disabled={joined || currentSpotsLeft <= 0}
          data-icon="inline-start"
          className={cn(
            'h-10 rounded-full px-5',
            joined && 'bg-accent text-accent-foreground',
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : joined ? (
            <Check className="size-4" />
          ) : null}
          {joined ? "You're in" : 'Join match'}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 text-xs font-medium text-destructive">{error}</p>
      ) : null}
    </article>
  )
}
