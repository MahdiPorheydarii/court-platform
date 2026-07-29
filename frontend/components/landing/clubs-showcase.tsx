'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, LayoutGrid, MapPin, Zap } from 'lucide-react'
import { api, type PublicClubCard } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { ROOT_DOMAIN } from '@/lib/club-host'

// A club with no cover set still gets a fitting court photo.
function coverFor(club: PublicClubCard): string {
  if (club.cover_image) return club.cover_image
  return club.sports.includes('padel') ? '/images/court-padel.jpg' : '/images/court-clay.jpg'
}

// A club's canonical home is its subdomain (riverside.acepair.ir). The path
// route (/riverside) still works as an alias.
function clubUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`
}

export function ClubsShowcase() {
  const [clubs, setClubs] = useState<PublicClubCard[] | null>(null)

  useEffect(() => {
    if (!API_ENABLED) {
      setClubs([])
      return
    }
    api.publicClubs().then(setClubs).catch(() => setClubs([]))
  }, [])

  // Nothing to show (offline showcase build, or no clubs opted in) — hide the
  // section entirely rather than render an empty shell.
  if (clubs !== null && clubs.length === 0) return null

  return (
    <section id="clubs" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 lg:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Clubs on AcePair</p>
          <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Find your club, find your game
          </h2>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            Each club runs its own courts, pricing, and open games. Step inside one to play.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {clubs === null
          ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
          : clubs.map((club) => <ClubCard key={club.slug} club={club} />)}
      </div>
    </section>
  )
}

function ClubCard({ club }: { club: PublicClubCard }) {
  return (
    <a
      href={clubUrl(club.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <img
          src={coverFor(club)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
        <div className="absolute inset-x-4 bottom-3 text-background">
          <h3 className="font-serif text-xl font-semibold leading-tight">{club.name}</h3>
          {club.location ? (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-background/85">
              <MapPin className="size-3.5" /> {club.location}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {club.tagline ? (
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{club.tagline}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {club.sports.map((s) => (
            <span
              key={s}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium capitalize text-secondary-foreground"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <LayoutGrid className="size-3.5 text-primary" /> {club.courts}
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap className="size-3.5 text-primary" /> {club.open_matches} open
            </span>
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            View club <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </a>
  )
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="aspect-[16/10] animate-pulse bg-muted" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}
