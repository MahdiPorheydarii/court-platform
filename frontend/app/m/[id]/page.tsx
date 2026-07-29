'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  MapPin,
  Share2,
  Users,
} from 'lucide-react'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/avatar-stack'
import { MatchFillRing } from '@/components/match-fill-ring'
import { ConfirmBurst } from '@/components/confirm-burst'
import { api, ApiError, type ApiMatch } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useMatchLive } from '@/lib/realtime'
import { useSession } from '@/lib/session'
import { dayLabel, timeLabel } from '@/lib/format'
import { levelTone, type Player } from '@/lib/club-data'
import { cn } from '@/lib/utils'

export default function MatchPosterPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { authed } = useSession()
  const [match, setMatch] = useState<ApiMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!API_ENABLED) {
      setNotFound(true)
      setLoading(false)
      return
    }
    api
      .publicMatch(id)
      .then(setMatch)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  async function join() {
    if (!authed) {
      router.push('/login')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const m = await api.joinMatch(id)
      setMatch(m)
      setJoined(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join this match.')
    } finally {
      setJoining(false)
    }
  }

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: match?.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-5 py-5">
        <Logo />
        <Link href="/discover" className="text-sm text-muted-foreground hover:text-foreground">
          Open app →
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-10">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : notFound || !match ? (
          <Empty />
        ) : (
          <Poster
            match={match}
            joined={joined}
            joining={joining}
            error={error}
            copied={copied}
            onJoin={join}
            onShare={share}
            authed={authed}
          />
        )}
      </main>
    </div>
  )
}

function Poster({
  match,
  joined,
  joining,
  error,
  copied,
  onJoin,
  onShare,
  authed,
}: {
  match: ApiMatch
  joined: boolean
  joining: boolean
  error: string | null
  copied: boolean
  onJoin: () => void
  onShare: () => void
  authed: boolean
}) {
  const hero = match.sport === 'padel' ? '/images/court-padel.jpg' : '/images/court-clay.jpg'
  const total = match.spots_total
  const live = useMatchLive(match.id, match.spots_filled, total)
  const filled = Math.max(match.spots_filled, live.filled)
  const spotsLeft = Math.max(0, total - filled)
  const confirmed = match.status === 'confirmed' || live.status === 'confirmed'
  const isLast = spotsLeft === 1
  const players = match.players as unknown as Player[]

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-primary/5">
      {live.justConfirmed ? <ConfirmBurst subtitle="Court booked · you're on!" /> : null}
      {/* Hero */}
      <div className="relative">
        <img src={hero} alt="" loading="eager" className="aspect-[16/10] w-full bg-muted object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
        <div className="absolute left-5 top-5 flex gap-2">
          <span className="rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium capitalize backdrop-blur">
            {match.sport}
          </span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur', levelTone(match.skill_level as never))}>
            {match.skill_level}
          </span>
        </div>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground backdrop-blur transition-colors hover:bg-card"
        >
          {copied ? <Check className="size-4 text-accent" /> : <Share2 className="size-4" />}
        </button>
        <div className="absolute inset-x-5 bottom-4 text-background">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance">{match.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-background/85">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {match.club_name}
              {match.court_name ? ` · ${match.court_name}` : ''}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {dayLabel(match.start_time)}, {timeLabel(match.start_time)} · {match.duration_mins} min
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <MatchFillRing filled={filled} total={total} confirmed={confirmed} size={64} />
          <div className="min-w-0">
            <AvatarStack players={players} emptySpots={spotsLeft} />
            <p className={cn('mt-2 text-sm font-medium', confirmed ? 'text-accent' : isLast ? 'text-primary' : 'text-muted-foreground')}>
              {confirmed
                ? 'This match is confirmed 🎾'
                : isLast
                  ? "You'd be the one who locks it in!"
                  : `${filled} in · ${spotsLeft} more to play`}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3">
          <div>
            <p className="font-serif text-2xl font-semibold">
              {match.price_per_person != null ? `$${match.price_per_person}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">per person when it fills · split evenly</p>
          </div>
          <Users className="size-5 text-primary" />
        </div>

        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

        {joined ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 rounded-full bg-accent/15 py-3 text-sm font-medium text-accent">
              <Check className="size-4" /> You're in — see you on court
            </div>
            <Button asChild variant="outline" className="h-11 rounded-full" data-icon="inline-end">
              <Link href="/my-games">
                View my games
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        ) : confirmed || spotsLeft === 0 ? (
          <Button disabled className="h-12 rounded-full">
            {confirmed ? 'Match confirmed' : 'Match is full'}
          </Button>
        ) : (
          <Button onClick={onJoin} disabled={joining} className="h-12 rounded-full text-base" data-icon="inline-end">
            {joining ? <Loader2 className="size-4 animate-spin" /> : null}
            {authed ? 'Join this match' : 'Sign in to join'}
            {!joining ? <ArrowRight className="size-4" /> : null}
          </Button>
        )}
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Users className="size-6" />
      </span>
      <div>
        <h1 className="font-serif text-2xl font-semibold">This match isn't available</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have filled up or been cancelled.</p>
      </div>
      <Button asChild className="rounded-full px-6" data-icon="inline-end">
        <Link href="/discover">
          Find another match
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}
