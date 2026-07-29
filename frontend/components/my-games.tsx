'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Clock, MapPin, Users, Crown, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/avatar-stack'
import { GameRowSkeleton } from '@/components/skeletons'
import { type UpcomingGame } from '@/lib/club-data'
import { useMyGames, useRequireAuth } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type Tab = 'upcoming' | 'past'

const roleLabel: Record<UpcomingGame['role'], string> = {
  host: 'Hosting',
  joined: 'Joined',
  booked: 'Booked',
}

function GameCard({ game }: { game: UpcomingGame }) {
  const spotsLeft = game.spotsTotal - game.players.length
  return (
    <article className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              game.role === 'host'
                ? 'bg-primary/12 text-primary'
                : game.role === 'booked'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-foreground/8 text-foreground',
            )}
          >
            {game.role === 'host' ? <Crown className="size-3" /> : null}
            {roleLabel[game.role]}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
            {game.sport}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
              game.status === 'confirmed'
                ? 'bg-accent/15 text-accent'
                : 'bg-primary/10 text-primary',
            )}
          >
            {game.status === 'confirmed' ? (
              <>
                <Check className="size-3" /> Confirmed
              </>
            ) : (
              `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} to fill`
            )}
          </span>
        </div>

        <h3 className="text-pretty font-serif text-xl font-semibold tracking-tight">
          {game.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" /> {game.club} · {game.court}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" /> {game.day}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" /> {game.time} · {game.durationMins}m
          </span>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <AvatarStack
            players={game.players}
            emptySpots={game.status === 'filling' ? spotsLeft : 0}
          />
          <span className="text-sm text-muted-foreground">
            {game.role === 'host'
              ? `${game.players.length} confirmed`
              : `${game.players.length} of ${game.spotsTotal} playing`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className="text-sm text-muted-foreground">
          <span className="text-lg font-semibold text-foreground">
            ${game.pricePerPerson}
          </span>
          /person
        </span>
        <Button
          variant="outline"
          className="h-10 rounded-full px-5"
          data-icon="inline-end"
        >
          Details
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Users className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h3 className="text-balance font-serif text-2xl font-semibold tracking-tight">
          Your next match is waiting
        </h3>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Nothing on your calendar yet. Jump into an open game near you — most
          fill within the hour.
        </p>
      </div>
      <Button asChild className="h-11 rounded-full px-6" data-icon="inline-end">
        <Link href="/discover">
          Find a match
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}

export function MyGames() {
  const [tab, setTab] = useState<Tab>('upcoming')
  useRequireAuth()
  const { games, loading } = useMyGames(tab)

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Your schedule
        </p>
        <h1 className="text-balance font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          My games
        </h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">
          Everything you&apos;re hosting, joined, or booked — all in one place.
        </p>
      </header>

      <div className="mt-6 flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1 text-sm font-medium sm:w-fit">
        {(['upcoming', 'past'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-full px-5 py-2 capitalize transition-colors sm:flex-none',
              tab === t
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {loading ? (
          <>
            <GameRowSkeleton />
            <GameRowSkeleton />
          </>
        ) : games.length === 0 ? (
          <EmptyState />
        ) : (
          games.map((g) => <GameCard key={g.id} game={g} />)
        )}
      </div>
    </main>
  )
}
