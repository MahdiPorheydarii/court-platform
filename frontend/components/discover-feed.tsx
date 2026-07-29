'use client'

import { useMemo, useState } from 'react'
import { SlidersHorizontal, Compass, Radar, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MatchCard } from '@/components/match-card'
import { CourtCard } from '@/components/court-card'
import { FindMatchDialog } from '@/components/find-match-dialog'
import { CardGridSkeleton } from '@/components/skeletons'
import { useDiscoverData, useRequireAuth } from '@/lib/hooks'
import { type Level, type Sport } from '@/lib/club-data'

type Tab = 'matches' | 'courts'
type SportFilter = 'all' | Sport

const levels: Level[] = ['Improver', 'Intermediate', 'Advanced']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="size-6" />
      </span>
      <div className="max-w-sm">
        <h3 className="font-serif text-xl font-semibold">
          No games match those filters — yet
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Loosen your filters and you will likely find a court within walking
          distance. New matches open up every few minutes.
        </p>
      </div>
      <Button onClick={onReset} variant="outline" className="rounded-full">
        Show everything
      </Button>
    </div>
  )
}

export function DiscoverFeed() {
  const [tab, setTab] = useState<Tab>('matches')
  const [sport, setSport] = useState<SportFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [level, setLevel] = useState<Level | 'any'>('any')
  const [hostOpen, setHostOpen] = useState(false)
  const { member } = useRequireAuth()
  const { matches: allMatches, courts: allCourts, loading, refresh } = useDiscoverData()

  const matches = useMemo(() => {
    return allMatches.filter((m) => {
      if (sport !== 'all' && m.sport !== sport) return false
      if (level !== 'any' && m.level !== level) return false
      return true
    })
  }, [allMatches, sport, level])

  const courts = useMemo(() => {
    return allCourts.filter((c) => sport === 'all' || c.sport === sport)
  }, [allCourts, sport])

  function resetFilters() {
    setSport('all')
    setLevel('any')
  }

  const isMatches = tab === 'matches'
  const items = isMatches ? matches : courts

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* Greeting + primary action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting()}, {member?.name?.split(' ')[0] ?? 'player'}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Find your next match
          </h1>
        </div>
        <Button
          onClick={() => setHostOpen(true)}
          className="h-11 w-fit rounded-full px-5"
          data-icon="inline-start"
        >
          <Radar className="size-4" />
          Find a match
        </Button>
      </div>

      {/* Upcoming games — empty state as storytelling */}
      <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary">
            <CalendarPlus className="size-5" />
          </span>
          <div>
            <p className="font-medium">No games on your calendar</p>
            <p className="text-sm text-muted-foreground">
              Join one below and it will show up here instantly.
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">7 friends</span> played
          this week
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-1 border-b border-border">
        {(
          [
            ['matches', 'Open matches'],
            ['courts', 'Court slots'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Essential filters + progressive disclosure toggle */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip active={sport === 'all'} onClick={() => setSport('all')}>
          All sports
        </Chip>
        <Chip active={sport === 'padel'} onClick={() => setSport('padel')}>
          Padel
        </Chip>
        <Chip active={sport === 'tennis'} onClick={() => setSport('tennis')}>
          Tennis
        </Chip>

        {isMatches ? (
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              showFilters
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
          </button>
        ) : null}
      </div>

      {/* Advanced filters revealed on demand */}
      {isMatches && showFilters ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Skill level
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip active={level === 'any'} onClick={() => setLevel('any')}>
              Any level
            </Chip>
            {levels.map((l) => (
              <Chip key={l} active={level === l} onClick={() => setLevel(l)}>
                {l}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* Feed */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <CardGridSkeleton count={6} />
        ) : items.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : isMatches ? (
          matches.map((m) => <MatchCard key={m.id} match={m} />)
        ) : (
          courts.map((c) => <CourtCard key={c.id} slot={c} />)
        )}
      </div>

      <FindMatchDialog
        open={hostOpen}
        onClose={() => setHostOpen(false)}
        onSubmitted={refresh}
      />
    </div>
  )
}
