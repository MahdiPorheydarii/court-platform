import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatchCard } from '@/components/match-card'
import { openMatches } from '@/lib/club-data'

export function FeedPreview() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">
            Open right now
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Real games, filling up as you read
          </h2>
        </div>
        <Button
          asChild
          variant="ghost"
          className="w-fit text-muted-foreground hover:text-foreground"
        >
          <Link href="/discover" data-icon="inline-end">
            See all matches
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {openMatches.slice(0, 3).map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  )
}
