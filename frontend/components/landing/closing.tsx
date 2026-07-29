import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export function Closing() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-border">
        <img
          src="/images/players.jpg"
          alt="Two padel players sharing a relaxed high-five in golden light"
          loading="lazy"
          className="absolute inset-0 size-full bg-muted object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/70 to-foreground/40" />

        <div className="relative flex flex-col gap-10 px-6 py-14 text-background sm:px-12 lg:py-20">
          <div className="max-w-lg">
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Bring your club online
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-background/80 text-pretty">
              Set up courts, pricing, and matchmaking in minutes — then let your
              members fill the games themselves. No lock-in, no group-chat chaos.
            </p>
            <Button
              asChild
              className="mt-7 h-12 rounded-full bg-background px-6 text-base text-foreground hover:bg-background/90"
            >
              <Link href="/login?register=1" data-icon="inline-end">
                Start your club
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <p className="border-t border-background/20 pt-6 text-sm text-background/80">
            Just here to play?{' '}
            <Link href="#clubs" className="font-medium text-background underline underline-offset-4 hover:text-background/80">
              Explore clubs on AcePair
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Logo href={null} markClassName="size-6" className="text-foreground" />
        <p>Tennis &amp; padel, made social. © 2026 AcePair.</p>
        <div className="flex items-center gap-6">
          <Link href="#clubs" className="hover:text-foreground">
            Clubs
          </Link>
          <Link href="#how" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/login?register=1" className="hover:text-foreground">
            For clubs
          </Link>
        </div>
      </div>
    </footer>
  )
}
