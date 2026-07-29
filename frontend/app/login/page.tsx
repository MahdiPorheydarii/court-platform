'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, KeyRound, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { api, ApiError } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { clubSlugFromHost } from '@/lib/club-host'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'register'

// Demo account for evaluators. Values come from build-time public env so no
// credential lives in source; the card only appears when a demo password is set.
const DEMO = {
  slug: process.env.NEXT_PUBLIC_DEMO_SLUG || 'riverside',
  email: process.env.NEXT_PUBLIC_DEMO_EMAIL || 'alex@riverside.club',
  password: process.env.NEXT_PUBLIC_DEMO_PASSWORD || '',
}
const DEMO_ENABLED = DEMO.password.length > 0

export default function LoginPage() {
  const router = useRouter()
  const { login } = useSession()
  const [mode, setMode] = useState<Mode>('signin')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [clubName, setClubName] = useState('')
  const [adminName, setAdminName] = useState('')

  // Prefill the club handle from the ?club= param (arriving from a club page)
  // or from a club subdomain (riverside.acepair.ir).
  useEffect(() => {
    const club = new URLSearchParams(window.location.search).get('club') || clubSlugFromHost()
    if (club) setSlug(club)
  }, [])

  async function signIn(creds: { slug: string; email: string; password: string }) {
    setPending(true)
    setError(null)
    try {
      const res = await api.login(creds.slug, creds.email, creds.password)
      login(res.access_token, res.member, res.club)
      router.push('/discover')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Check your details.')
      setPending(false)
    }
  }

  async function registerClub() {
    setPending(true)
    setError(null)
    try {
      const res = await api.registerClub({
        club_name: clubName,
        slug,
        admin_name: adminName,
        admin_email: email,
        admin_password: password,
      })
      login(res.access_token, res.member, res.club)
      router.push('/admin')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the club.')
      setPending(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!API_ENABLED) {
      router.push('/discover')
      return
    }
    if (mode === 'signin') signIn({ slug, email, password })
    else registerClub()
  }

  function fillDemo() {
    setMode('signin')
    setSlug(DEMO.slug)
    setEmail(DEMO.email)
    setPassword(DEMO.password)
    setError(null)
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {mode === 'signin' ? 'Welcome back' : 'Start your club'}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {mode === 'signin' ? 'Get on court' : 'Onboard your club'}
          </h1>
          <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
            {mode === 'signin'
              ? 'Sign in to find matches, book courts, and split the fee.'
              : 'Set up courts, pricing, and matchmaking in minutes.'}
          </p>

          {/* Demo account — sign in normally with a sample login */}
          {mode === 'signin' && DEMO_ENABLED ? (
            <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="size-4" /> Try the demo account
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Club</dt>
                <dd className="font-medium tabular-nums">{DEMO.slug}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{DEMO.email}</dd>
                <dt className="text-muted-foreground">Password</dt>
                <dd className="font-medium">{DEMO.password}</dd>
              </dl>
              <button
                type="button"
                onClick={fillDemo}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <KeyRound className="size-3.5" />
                Fill demo credentials
              </button>
            </div>
          ) : null}

          {/* Mode toggle */}
          <div className="mt-6 flex rounded-full border border-border bg-muted/50 p-1 text-sm font-medium">
            {(['signin', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={cn(
                  'flex-1 rounded-full px-4 py-2 transition-colors',
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'signin' ? 'Sign in' : 'Start a club'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {mode === 'register' ? (
              <>
                <Field label="Club name">
                  <Input value={clubName} onChange={setClubName} placeholder="Riverside Padel" required />
                </Field>
                <Field label="Your name">
                  <Input value={adminName} onChange={setAdminName} placeholder="Alex Rivera" required />
                </Field>
              </>
            ) : null}

            <Field label="Club address" hint="Your club's short handle">
              <Input value={slug} onChange={(v) => setSlug(v.toLowerCase())} placeholder="riverside" required />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={setEmail} placeholder="you@club.com" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={setPassword} placeholder="••••••••" required />
            </Field>

            {error ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="h-11 rounded-full" data-icon="inline-end">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === 'signin' ? 'Sign in' : 'Create club'}
              {!pending ? <ArrowRight className="size-4" /> : null}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>

      {/* Visual side */}
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src="/images/players.jpg"
          alt="Two padel players sharing a high-five in golden light"
          loading="eager"
          className="absolute inset-0 size-full bg-muted object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/45 to-foreground/20" />
        <svg
          className="absolute inset-0 size-full text-background/25"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <rect x="10" y="14" width="80" height="72" fill="none" stroke="currentColor" strokeWidth="0.4" />
          <line x1="50" y1="14" x2="50" y2="86" stroke="currentColor" strokeWidth="0.4" />
          <line x1="10" y1="38" x2="90" y2="38" stroke="currentColor" strokeWidth="0.4" />
          <line x1="10" y1="62" x2="90" y2="62" stroke="currentColor" strokeWidth="0.4" />
        </svg>
        <div className="absolute inset-x-0 bottom-0 p-10 text-background">
          <p className="max-w-md font-serif text-2xl font-semibold leading-snug text-balance">
            &ldquo;Never chase a fourth player again. Post a game, and AcePair fills it.&rdquo;
          </p>
          <p className="mt-3 text-sm text-background/70">Members at 12 partner clubs</p>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="h-11 rounded-xl border border-border bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-3 focus:ring-primary/15"
    />
  )
}
