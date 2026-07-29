'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, MapPin, Loader2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/avatar-stack'
import { MatchFillRing } from '@/components/match-fill-ring'
import { api, ApiError } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useMatchLive } from '@/lib/realtime'
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
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const isLive = API_ENABLED && match.id.includes('-') && match.id.length >= 32
  const { filled, status, justConfirmed, optimisticJoin } = useMatchLive(
    match.id,
    match.players.length,
    match.spotsTotal,
  )
  const confirmed = status === 'confirmed' || match.status === 'confirmed'
  const spotsLeft = Math.max(0, match.spotsTotal - filled)

  const fillLabel = confirmed
    ? 'Locked in — court booked'
    : spotsLeft === 0
      ? 'Match is full'
      : spotsLeft === 1
        ? 'One more to lock it in!'
        : `${spotsLeft} spots to lock it in`

  function handleJoin() {
    if (joined || spotsLeft <= 0 || confirmed) return
    if (API_ENABLED && !authed) {
      router.push('/login')
      return
    }
    setError(null)
    setJoined(true)
    setPlayers((prev) => [...prev, you])
    optimisticJoin()

    startTransition(async () => {
      if (!isLive) {
        await new Promise((r) => setTimeout(r, 600))
        return
      }
      try {
        await api.joinMatch(match.id)
      } catch (e) {
        setJoined(false)
        setPlayers(match.players)
        setError(e instanceof ApiError ? e.message : 'Could not join — that spot was just taken.')
      }
    })
  }

  async function share() {
    const url = `${window.location.origin}/m/${match.id}`
    const data = {
      title: match.title,
      text: `${match.title} — ${match.day} ${match.time}. ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left on AcePair.`,
      url,
    }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-center justify-between">
        <SportBadge sport={match.sport} />
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', levelTone(match.level))}>
          {match.level}
        </span>
      </div>

      <h3 className="mt-3 font-serif text-xl font-semibold tracking-tight">{match.title}</h3>

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

      {/* Live fill meter — sweeps as players join over the socket */}
      <div className="mt-4 flex items-center gap-3">
        <MatchFillRing filled={filled} total={match.spotsTotal} confirmed={confirmed} justConfirmed={justConfirmed} />
        <div className="min-w-0">
          <AvatarStack players={players} emptySpots={Math.max(spotsLeft, 0)} size="sm" />
          <p
            className={cn(
              'mt-1.5 text-xs font-medium',
              confirmed ? 'text-accent' : spotsLeft === 1 ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {fillLabel}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="font-serif text-lg font-semibold">${match.pricePerPerson}</p>
          <p className="text-xs text-muted-foreground">per person · split</p>
        </div>

        <Button
          onClick={handleJoin}
          disabled={joined || spotsLeft <= 0 || confirmed}
          data-icon="inline-start"
          className={cn('h-10 rounded-full px-5', (joined || confirmed) && 'bg-accent text-accent-foreground')}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : joined ? <Check className="size-4" /> : null}
          {confirmed ? 'Confirmed' : joined ? "You're in" : 'Join match'}
        </Button>
      </div>

      {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}

      {/* Share (live matches only) */}
      {isLive ? (
        <button
          type="button"
          onClick={share}
          aria-label="Share match"
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-card/80 text-muted-foreground opacity-0 backdrop-blur transition hover:text-foreground group-hover:opacity-100 max-sm:opacity-100"
        >
          {copied ? <Check className="size-4 text-accent" /> : <Share2 className="size-4" />}
        </button>
      ) : null}

      {/* Celebratory reveal when the match locks in */}
      {justConfirmed ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card/95 text-center backdrop-blur-sm animate-in fade-in zoom-in-95">
          <div className="relative flex size-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-accent/25 animate-ping" />
            <span className="relative flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-7" strokeWidth={2.6} />
            </span>
          </div>
          <p className="font-serif text-lg font-semibold">Match locked in!</p>
          <p className="text-xs text-muted-foreground">Court booked · fee split evenly</p>
        </div>
      ) : null}
    </article>
  )
}
