'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, LayoutGrid, Loader2, Users, Zap } from 'lucide-react'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useSession } from '@/lib/session'
import { levelTone, type Level } from '@/lib/club-data'
import { cn } from '@/lib/utils'

const LEVELS: Level[] = ['Beginner', 'Improver', 'Intermediate', 'Advanced']

type PublicClub = { name: string; slug: string; sports: string[]; courts: number; open_matches: number }

export default function ClubPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { login } = useSession()
  const [club, setClub] = useState<PublicClub | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [level, setLevel] = useState<Level>('Intermediate')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!API_ENABLED) {
      setNotFound(true)
      setLoading(false)
      return
    }
    api
      .publicClub(slug)
      .then(setClub)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const r = await api.registerMember(slug, { name, email, password, skill_level: level })
      login(r.access_token, r.member, r.club)
      router.push('/discover')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join this club.')
      setPending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !club) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Logo href="/" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">No club at that address</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          &ldquo;{slug}&rdquo; isn&apos;t a club on AcePair yet.
        </p>
        <Button asChild className="rounded-full px-6" data-icon="inline-end">
          <Link href="/login">
            Start a club
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: club + join */}
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Members club</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {club.name}
          </h1>
          <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
            Find matches, book courts, and split the fee at {club.name} on AcePair.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <LayoutGrid className="size-3.5 text-primary" /> {club.courts} courts
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
              <Zap className="size-3.5 text-primary" /> {club.open_matches} open matches
            </span>
            {club.sports.map((s) => (
              <span key={s} className="rounded-full bg-secondary px-3 py-1 capitalize text-secondary-foreground">
                {s}
              </span>
            ))}
          </div>

          <form onSubmit={join} className="mt-7 flex flex-col gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-primary" /> Join {club.name}
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="h-11 rounded-xl border border-border bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="h-11 rounded-xl border border-border bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="h-11 rounded-xl border border-border bg-card px-3.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    level === l ? levelTone(l) + ' ring-1 ring-primary/40' : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>

            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

            <Button type="submit" disabled={pending} className="mt-1 h-11 rounded-full" data-icon="inline-end">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Join {club.name}
              {!pending ? <ArrowRight className="size-4" /> : null}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already a member?{' '}
            <Link href={`/login?club=${club.slug}`} className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right: visual */}
      <div className="relative hidden overflow-hidden lg:block">
        <img src="/images/hero-court.jpg" alt="" loading="eager" className="absolute inset-0 size-full bg-muted object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-foreground/10" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-background">
          <p className="max-w-md font-serif text-2xl font-semibold leading-snug text-balance">
            Never chase a fourth player again — {club.name} games fill themselves.
          </p>
        </div>
      </div>
    </div>
  )
}
