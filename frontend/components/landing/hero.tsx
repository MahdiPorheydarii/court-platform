import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AvatarStack } from '@/components/avatar-stack'
import { players } from '@/lib/club-data'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-20 lg:pb-24">
        <div className="flex flex-col gap-7">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent" />
            The members club for tennis &amp; padel
          </span>

          <h1 className="font-serif text-5xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Play more.
            <br />
            <span className="text-primary">Book less.</span>
          </h1>

          <p className="max-w-md text-lg leading-relaxed text-muted-foreground text-pretty">
            AcePair is the members club for finding your next match. Join an
            open game, split the court, and be on court by sundown — all in a
            single tap.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild className="h-12 rounded-full px-6 text-base">
              <Link href="/discover" data-icon="inline-end">
                Find a match
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full px-6 text-base"
            >
              <Link href="/discover">Book a court</Link>
            </Button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <AvatarStack players={players.slice(0, 4)} size="sm" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">2,400+ members</span>{' '}
              matched this month
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="relative overflow-hidden rounded-3xl border border-border shadow-2xl shadow-primary/10">
            <img
              src="/images/hero-court.jpg"
              alt="A padel court in warm golden-hour light with players mid-rally"
              width={1000}
              height={1250}
              loading="eager"
              fetchPriority="high"
              className="aspect-[4/5] w-full bg-muted object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-foreground/50 to-transparent" />

            {/* Floating live match card */}
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-border/60 bg-card/95 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  Live now
                </span>
                <span className="text-xs text-muted-foreground">6:30 PM · Today</span>
              </div>
              <p className="mt-2 font-serif text-lg font-semibold">
                Golden-hour doubles
              </p>
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                Riverside Padel · Court 3
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AvatarStack
                    players={players.slice(0, 3)}
                    emptySpots={1}
                    size="sm"
                  />
                  <span className="text-xs font-medium text-foreground">
                    1 spot left
                  </span>
                </div>
                <Button size="sm" className="h-8 rounded-full px-3">
                  Join
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
