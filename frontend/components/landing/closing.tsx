import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

const stats = [
  { value: '2,400+', label: 'Active members' },
  { value: '12', label: 'Partner clubs' },
  { value: '18k', label: 'Matches played' },
  { value: '4.9', label: 'Average rating' },
]

export function Closing() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-border">
        <img
          src="/images/players.png"
          alt="Two padel players sharing a relaxed high-five in golden light"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/70 to-foreground/40" />

        <div className="relative flex flex-col gap-8 px-6 py-14 text-background sm:px-12 lg:py-20">
          <div className="max-w-lg">
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Your next match is one tap away
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-background/80 text-pretty">
              Join AcePair free. No lock-in, no hunting group chats for a fourth
              player — just good games, close to home.
            </p>
            <Button
              asChild
              className="mt-7 h-12 rounded-full bg-background px-6 text-base text-foreground hover:bg-background/90"
            >
              <Link href="/discover" data-icon="inline-end">
                Enter the club
                <ArrowRight />
              </Link>
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-6 border-t border-background/20 pt-8 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="font-serif text-3xl font-semibold">{s.value}</dt>
                <dd className="mt-1 text-sm text-background/70">{s.label}</dd>
              </div>
            ))}
          </dl>
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
        <p>Tennis &amp; padel, made social. © {new Date().getFullYear()} AcePair.</p>
        <div className="flex items-center gap-6">
          <Link href="/discover" className="hover:text-foreground">
            Matches
          </Link>
          <Link href="/discover" className="hover:text-foreground">
            Courts
          </Link>
          <Link href="/" className="hover:text-foreground">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  )
}
