'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  ExternalLink,
  LayoutGrid,
  Loader2,
  Lock,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Users2,
  Zap,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import {
  api,
  ApiError,
  type ApiBooking,
  type ApiCourt,
  type ApiMatch,
  type ApiMemberDir,
  type ApiReservation,
} from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { clubSlugFromHost } from '@/lib/club-host'
import { useRequireAuth } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type Section = 'courts' | 'schedule' | 'bookings' | 'members' | 'pricing'

export default function AdminPage() {
  const { authed, member, club, loading } = useRequireAuth()
  const [section, setSection] = useState<Section>('courts')

  // The club's real public address, resolved from the current host so it
  // matches wherever the admin actually is: on a club subdomain it reads
  // "riverside.acepair.ir"; on the apex it reads "acepair.ir/riverside".
  // Computed client-side (post-mount) to avoid an SSR/hydration mismatch.
  const [publicUrl, setPublicUrl] = useState<{ label: string; href: string } | null>(null)
  useEffect(() => {
    if (!club?.slug) return
    const host = window.location.host
    const onSubdomain = clubSlugFromHost(window.location.hostname) === club.slug
    setPublicUrl(
      onSubdomain
        ? { label: host, href: '/' }
        : { label: `${host}/${club.slug}`, href: `/${club.slug}` },
    )
  }, [club?.slug])

  const gated =
    !API_ENABLED ? (
      <Gate
        icon={Lock}
        title="Connect a backend to manage your club"
        body="This preview runs on demo data. Point AcePair at a live API and sign in as an admin to manage courts and pricing."
      />
    ) : loading ? (
      <div className="mt-24 flex justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ) : !authed ? (
      <Gate icon={Lock} title="Sign in to manage your club" body="Club settings are available to signed-in admins." action={<Link href="/login">Sign in</Link>} />
    ) : member?.role !== 'admin' ? (
      <Gate icon={Lock} title="Admins only" body="Ask a club admin for access to court and pricing settings." />
    ) : null

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
        {/* Club identity header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Building2 className="size-6" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Club admin</p>
              <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
                {club?.name ?? 'Your club'}
              </h1>
            </div>
          </div>
          {publicUrl ? (
            <a
              href={publicUrl.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              title="View your club's public page"
            >
              <span className="font-medium text-foreground">{publicUrl.label}</span>
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        {gated ? (
          gated
        ) : (
          <>
            <StatRow />
            {/* Section switcher */}
            <div className="mt-8 flex gap-1 overflow-x-auto rounded-full border border-border bg-muted/50 p-1 text-sm font-medium">
              {(
                [
                  ['courts', 'Courts', LayoutGrid],
                  ['schedule', 'Schedule', CalendarDays],
                  ['bookings', 'Bookings', CalendarClock],
                  ['members', 'Members', Users2],
                  ['pricing', 'Pricing & rules', CircleDollarSign],
                ] as [Section, string, typeof LayoutGrid][]
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 transition-colors sm:flex-none',
                    section === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {section === 'courts' ? (
                <CourtsPanel />
              ) : section === 'schedule' ? (
                <SchedulePanel />
              ) : section === 'bookings' ? (
                <BookingsPanel />
              ) : section === 'members' ? (
                <MembersPanel />
              ) : (
                <RulesPanel />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// --------------------------------------------------------------------------- //
//  Stats                                                                       //
// --------------------------------------------------------------------------- //
function StatRow() {
  const [courts, setCourts] = useState<ApiCourt[] | null>(null)
  const [matches, setMatches] = useState<ApiMatch[] | null>(null)

  useEffect(() => {
    api.listCourts(true).then(setCourts).catch(() => setCourts([]))
    api.listMatches('all').then(setMatches).catch(() => setMatches([]))
  }, [])

  const stats = useMemo(() => {
    const activeCourts = (courts ?? []).filter((c) => c.is_active).length
    const openMatches = (matches ?? []).filter((m) => m.status === 'open').length
    const confirmed = (matches ?? []).filter((m) => m.status === 'confirmed').length
    return [
      { label: 'Active courts', value: activeCourts, icon: LayoutGrid, ready: courts !== null },
      { label: 'Open matches', value: openMatches, icon: Zap, ready: matches !== null },
      { label: 'Confirmed games', value: confirmed, icon: Check, ready: matches !== null },
    ]
  }, [courts, matches])

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <s.icon className="size-5" />
          </span>
          <div>
            <p className="font-serif text-2xl font-semibold tabular-nums">
              {s.ready ? s.value : '—'}
            </p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// --------------------------------------------------------------------------- //
//  Courts                                                                      //
// --------------------------------------------------------------------------- //
const SURFACES = ['Glass', 'Panoramic', 'Clay', 'Hard', 'Grass', 'Carpet']
// Index 0=Mon … 6=Sun, matching the backend's peak-window day numbering.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function CourtsPanel() {
  const [courts, setCourts] = useState<ApiCourt[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [sport, setSport] = useState<'padel' | 'tennis'>('padel')
  const [surface, setSurface] = useState('Glass')
  const [indoor, setIndoor] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCourts(await api.listCourts(true))
    } catch {
      setCourts([])
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function addCourt(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createCourt({
        name,
        sport,
        surface,
        indoor,
        image_url: imageUrl.trim() || undefined,
        hourly_rate_cents: rate ? Math.round(Number(rate) * 100) : null,
      })
      setName('')
      setImageUrl('')
      setRate('')
      setAdding(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add court.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: ApiCourt) => {
    if (c.is_active) await api.deleteCourt(c.id).catch(() => {})
    else await api.updateCourt(c.id, { is_active: true }).catch(() => {})
    await load()
  }

  return (
    <section>
      <div className="grid gap-4 sm:grid-cols-2">
        {courts === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />
            ))
          : courts.map((c) => (
              <article
                key={c.id}
                className={cn(
                  'flex items-center justify-between rounded-2xl border border-border p-4 transition-colors',
                  c.is_active ? 'bg-card' : 'bg-muted/30',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-xl font-serif text-lg font-semibold',
                      c.sport === 'padel' ? 'bg-primary/12 text-primary' : 'bg-accent/15 text-accent',
                    )}
                    aria-hidden
                  >
                    {c.name.replace(/[^0-9]/g, '') || c.name[0]}
                  </span>
                  <div>
                    <p className={cn('font-medium', !c.is_active && 'text-muted-foreground')}>{c.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {c.sport} · {c.surface}
                      {/(indoor|outdoor)/i.test(c.surface) ? '' : ` · ${c.indoor ? 'Indoor' : 'Outdoor'}`}
                      {c.hourly_rate_cents ? (
                        <span className="font-medium text-primary"> · ${Math.round(c.hourly_rate_cents / 100)}/hr</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.is_active}
                    onClick={() => toggleActive(c)}
                    className={cn(
                      'relative h-6 w-10 rounded-full transition-colors',
                      c.is_active ? 'bg-accent' : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                        c.is_active ? 'left-[1.125rem]' : 'left-0.5',
                      )}
                    />
                  </button>
                  {c.is_active ? 'Live' : 'Off'}
                </label>
              </article>
            ))}

        {/* Add court card */}
        {adding ? (
          <form onSubmit={addCourt} className="rounded-2xl border border-primary/40 bg-primary/[0.04] p-4 sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New court</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Court name (e.g. Court 3)"
                required
                autoFocus
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
              />
              <div className="flex gap-2">
                {(['padel', 'tennis'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSport(s)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-colors',
                      sport === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <select
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {SURFACES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 px-1 text-sm">
                <input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} className="size-4 accent-primary" />
                Indoor court
              </label>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL (optional)"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
              />
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="Hourly rate $ (blank = sport rate)"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
              />
            </div>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button type="submit" disabled={saving} className="h-10 rounded-full px-5" data-icon="inline-start">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Add court
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="h-10 rounded-full px-4">
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-[5rem] items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add a court
          </button>
        )}
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- //
//  Pricing & rules                                                             //
// --------------------------------------------------------------------------- //
function feePerPerson(baseCents: number, mins: number, mult: number, peak: boolean, split: number): string {
  const total = Math.round(baseCents * (mins / 60) * (peak ? mult : 1))
  return (Math.ceil(total / split) / 100).toFixed(2)
}

function RulesPanel() {
  const [config, setConfig] = useState<Record<string, any> | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig({}))
  }, [])

  function patch(path: string[], value: unknown) {
    setConfig((prev) => {
      const next = structuredClone(prev ?? {})
      let node: any = next
      for (let i = 0; i < path.length - 1; i++) {
        node[path[i]] = node[path[i]] ?? {}
        node = node[path[i]]
      }
      node[path[path.length - 1]] = value
      return next
    })
    setSaved(false)
  }

  function updateWindows(fn: (ws: any[]) => any[]) {
    setConfig((prev) => {
      const next = structuredClone(prev ?? {})
      next.peak_windows = fn(next.peak_windows ?? [])
      return next
    })
    setSaved(false)
  }

  async function save() {
    if (!config) return
    setSaving(true)
    try {
      await api.updateConfig({
        fees: config.fees,
        min_players: config.min_players,
        cancellation_window_hours: config.cancellation_window_hours,
        unfilled_policy: config.unfilled_policy,
        peak_windows: config.peak_windows,
      })
      setSaved(true)
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
  }

  const dollars = (cents?: number) => (cents ? Math.round(cents / 100) : 0)

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['padel', 'tennis'] as const).map((sport) => (
            <div key={sport} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                    sport === 'padel' ? 'bg-primary/12 text-primary' : 'bg-accent/15 text-accent',
                  )}
                >
                  {sport}
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <NumberField
                  label="Base rate / hour ($)"
                  value={dollars(config.fees?.[sport]?.base_rate_per_hour_cents)}
                  onChange={(v) => patch(['fees', sport, 'base_rate_per_hour_cents'], v * 100)}
                />
                <NumberField
                  label="Peak multiplier"
                  step={0.05}
                  value={config.fees?.[sport]?.peak_multiplier ?? 1}
                  onChange={(v) => patch(['fees', sport, 'peak_multiplier'], v)}
                />
                <NumberField
                  label="Players to confirm"
                  value={config.min_players?.[sport] ?? 2}
                  onChange={(v) => patch(['min_players', sport], v)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <NumberField
            label="Cancellation window (hours)"
            value={config.cancellation_window_hours ?? 12}
            onChange={(v) => patch(['cancellation_window_hours'], v)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">If a match doesn&apos;t fill</span>
            <select
              value={config.unfilled_policy ?? 'cancel'}
              onChange={(e) => patch(['unfilled_policy'], e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            >
              <option value="cancel">Cancel — no charge</option>
              <option value="partial">Present players split the whole fee</option>
              <option value="absorb">Club absorbs the empty seats</option>
            </select>
          </label>
        </div>

        {/* Peak hours — games starting in these windows use the peak multiplier */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Peak hours</p>
              <p className="text-xs text-muted-foreground">
                Games starting in these windows are charged the peak multiplier.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateWindows((ws) => [...ws, { days: [0, 1, 2, 3, 4], start: '17:00', end: '21:00' }])}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add window
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {(config.peak_windows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No peak windows — every hour is off-peak.</p>
            ) : null}
            {(config.peak_windows ?? []).map((w: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, di) => {
                    const on = (w.days ?? []).includes(di)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          updateWindows((ws) =>
                            ws.map((x, idx) =>
                              idx === i
                                ? {
                                    ...x,
                                    days: on
                                      ? x.days.filter((v: number) => v !== di)
                                      : [...(x.days ?? []), di].sort((a: number, b: number) => a - b),
                                  }
                                : x,
                            ),
                          )
                        }
                        className={cn(
                          'size-8 rounded-lg text-xs font-medium transition-colors',
                          on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {d[0]}
                      </button>
                    )
                  })}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="time"
                    value={w.start ?? '17:00'}
                    onChange={(e) => updateWindows((ws) => ws.map((x, idx) => (idx === i ? { ...x, start: e.target.value } : x)))}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={w.end ?? '21:00'}
                    onChange={(e) => updateWindows((ws) => ws.map((x, idx) => (idx === i ? { ...x, end: e.target.value } : x)))}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => updateWindows((ws) => ws.filter((_, idx) => idx !== i))}
                    aria-label="Remove window"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving} className="h-10 rounded-full px-6" data-icon="inline-start">
            {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
            {saved ? 'Saved' : 'Save changes'}
          </Button>
          {saved ? <span className="text-sm text-accent">Your pricing is live.</span> : null}
        </div>
      </div>

      {/* Live fee preview — shows the data-driven pricing in action */}
      <aside className="h-fit rounded-2xl border border-border bg-secondary/40 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Live preview
        </div>
        <p className="mt-1 text-xs text-muted-foreground">What players pay, per person.</p>
        <div className="mt-4 flex flex-col gap-3">
          <PreviewRow
            title="Padel · peak · 90 min"
            sub={`Split ${config.min_players?.padel ?? 4} ways`}
            amount={feePerPerson(
              config.fees?.padel?.base_rate_per_hour_cents ?? 0,
              90,
              config.fees?.padel?.peak_multiplier ?? 1,
              true,
              config.min_players?.padel ?? 4,
            )}
          />
          <PreviewRow
            title="Tennis · off-peak · 60 min"
            sub={`Split ${config.min_players?.tennis ?? 2} ways`}
            amount={feePerPerson(
              config.fees?.tennis?.base_rate_per_hour_cents ?? 0,
              60,
              config.fees?.tennis?.peak_multiplier ?? 1,
              false,
              config.min_players?.tennis ?? 2,
            )}
          />
        </div>
      </aside>
    </section>
  )
}

function PreviewRow({ title, sub, amount }: { title: string; sub: string; amount: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <p className="font-serif text-lg font-semibold">${amount}</p>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
      />
    </label>
  )
}

function Gate({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <div className="max-w-sm">
        <h3 className="font-serif text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {action ? (
        <Button asChild className="rounded-full px-5">
          {action}
        </Button>
      ) : null}
    </div>
  )
}

// --------------------------------------------------------------------------- //
//  Shared helpers (admin panels render client-side, so local dates are safe)   //
// --------------------------------------------------------------------------- //
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
const SOURCE_META: Record<string, { label: string; cls: string }> = {
  match: { label: 'Match', cls: 'bg-primary/12 text-primary' },
  direct: { label: 'Booking', cls: 'bg-accent/15 text-accent' },
  hold: { label: 'Hold', cls: 'bg-muted text-muted-foreground' },
}
function SourceBadge({ source }: { source: string }) {
  const m = SOURCE_META[source] ?? SOURCE_META.direct
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>{m.label}</span>
}

// --------------------------------------------------------------------------- //
//  Schedule — operating hours, slot lengths, week view, recurring holds        //
// --------------------------------------------------------------------------- //
function SchedulePanel() {
  const [config, setConfig] = useState<Record<string, any> | null>(null)
  const [savingHours, setSavingHours] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig({}))
  }, [])

  function setCfg(path: string[], value: unknown) {
    setConfig((prev) => {
      const next = structuredClone(prev ?? {})
      let node: any = next
      for (let i = 0; i < path.length - 1; i++) {
        node[path[i]] = node[path[i]] ?? {}
        node = node[path[i]]
      }
      node[path[path.length - 1]] = value
      return next
    })
    setHoursSaved(false)
  }

  async function saveHours() {
    if (!config) return
    setSavingHours(true)
    try {
      await api.updateConfig({ operating_hours: config.operating_hours, slot_minutes: config.slot_minutes })
      setHoursSaved(true)
    } catch {
      /* ignore */
    } finally {
      setSavingHours(false)
    }
  }

  if (!config) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />

  const oh = config.operating_hours ?? { start: '08:00', end: '22:00' }
  const slots = config.slot_minutes ?? { padel: 90, tennis: 60 }

  return (
    <div className="flex flex-col gap-6">
      {/* Operating hours + slot lengths (A1 / A3) */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4 text-primary" /> Opening hours &amp; slot lengths
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          When courts are bookable, and the default game length per sport. Availability follows these.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Opens</span>
            <input
              type="time"
              value={oh.start ?? '08:00'}
              onChange={(e) => setCfg(['operating_hours', 'start'], e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Closes</span>
            <input
              type="time"
              value={oh.end ?? '22:00'}
              onChange={(e) => setCfg(['operating_hours', 'end'], e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <NumberField label="Padel slot (min)" step={15} value={slots.padel ?? 90} onChange={(v) => setCfg(['slot_minutes', 'padel'], v)} />
          <NumberField label="Tennis slot (min)" step={15} value={slots.tennis ?? 60} onChange={(v) => setCfg(['slot_minutes', 'tennis'], v)} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={saveHours} disabled={savingHours} className="h-10 rounded-full px-6" data-icon="inline-start">
            {savingHours ? <Loader2 className="size-4 animate-spin" /> : hoursSaved ? <Check className="size-4" /> : null}
            {hoursSaved ? 'Saved' : 'Save hours'}
          </Button>
          {hoursSaved ? <span className="text-sm text-accent">Bookable hours updated.</span> : null}
        </div>
      </section>

      <WeekSchedule />
      <RecurringReservations />
    </div>
  )
}

function WeekSchedule() {
  const [bookings, setBookings] = useState<ApiBooking[] | null>(null)
  useEffect(() => {
    api.listBookings('club').then(setBookings).catch(() => setBookings([]))
  }, [])

  const days = useMemo(() => {
    if (!bookings) return null
    const now = Date.now()
    const end = now + 7 * 86400000
    const within = bookings
      .filter((b) => b.status !== 'cancelled' && new Date(b.end_time).getTime() > now && new Date(b.start_time).getTime() < end)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    const groups: { key: string; label: string; items: ApiBooking[] }[] = []
    for (const b of within) {
      const key = new Date(b.start_time).toDateString()
      let g = groups.find((x) => x.key === key)
      if (!g) {
        g = { key, label: fmtDay(b.start_time), items: [] }
        groups.push(g)
      }
      g.items.push(b)
    }
    return groups
  }, [bookings])

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-primary" /> This week&apos;s schedule
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Every court reservation across the next 7 days.</p>
      {days === null ? (
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-muted/40" />
      ) : days.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nothing booked in the next 7 days.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          {days.map((d) => (
            <div key={d.key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {d.items.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                      {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                    </span>
                    <span className="w-24 shrink-0 font-medium">{b.court_name}</span>
                    <span className="flex-1 truncate">{b.title}</span>
                    <SourceBadge source={b.source} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function RecurringReservations() {
  const [items, setItems] = useState<ApiReservation[] | null>(null)
  const [courts, setCourts] = useState<ApiCourt[]>([])
  const [adding, setAdding] = useState(false)
  const [courtId, setCourtId] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [time, setTime] = useState('18:00')
  const [duration, setDuration] = useState(90)
  const [weeks, setWeeks] = useState(12)
  const [title, setTitle] = useState('Coaching')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(await api.listReservations().catch(() => []))
  }, [])
  useEffect(() => {
    load()
    api.listCourts(false).then((cs) => {
      setCourts(cs)
      if (cs[0]) setCourtId(cs[0].id)
    }).catch(() => {})
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!courtId) return
    setSaving(true)
    setNote(null)
    try {
      const r = await api.createReservation({ court_id: courtId, title, weekday, start_time: time, duration_mins: duration, weeks })
      setNote(`Added ${r.created} holds${r.skipped ? `, skipped ${r.skipped} (already booked)` : ''}.`)
      setAdding(false)
      await load()
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : 'Could not create the reservation.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await api.deleteReservation(id).catch(() => {})
    await load()
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Repeat className="size-4 text-primary" /> Recurring reservations
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" /> New hold
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Weekly court holds (coaching, leagues, maintenance) — materialised as bookings for the next {weeks} weeks.
      </p>

      {adding ? (
        <form onSubmit={create} className="mt-4 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Court</span>
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary">
              {courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.sport}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Day</span>
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary">
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Start</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </label>
          <NumberField label="Duration (min)" step={15} value={duration} onChange={setDuration} />
          <NumberField label="Weeks" value={weeks} onChange={setWeeks} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Label</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Coaching" className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={saving} className="h-10 rounded-full px-5" data-icon="inline-start">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null} Create hold
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="h-10 rounded-full px-4">Cancel</Button>
          </div>
        </form>
      ) : null}

      {note ? <p className="mt-3 text-sm text-accent">{note}</p> : null}

      <div className="mt-4 flex flex-col gap-2">
        {items === null ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring holds yet.</p>
        ) : (
          items.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Repeat className="size-4" /></span>
              <div className="flex-1">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.court_name} · {DAYS[r.weekday]} {r.start_time} · {r.duration_mins} min · {r.upcoming} upcoming
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                aria-label="Cancel series"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- //
//  Bookings — all club bookings, cancellable (B1)                              //
// --------------------------------------------------------------------------- //
function BookingsPanel() {
  const [bookings, setBookings] = useState<ApiBooking[] | null>(null)
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBookings(await api.listBookings('club').catch(() => []))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    if (!bookings) return null
    const now = Date.now()
    return bookings
      .filter((b) => (when === 'upcoming' ? new Date(b.end_time).getTime() >= now : new Date(b.end_time).getTime() < now))
      .sort((a, b) => (when === 'upcoming' ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)))
  }, [bookings, when])

  async function cancel(id: string) {
    setBusy(id)
    await api.cancelBooking(id).catch(() => {})
    await load()
    setBusy(null)
  }

  return (
    <section>
      <div className="flex w-fit rounded-full border border-border bg-muted/50 p-1 text-sm font-medium">
        {(['upcoming', 'past'] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWhen(w)}
            className={cn('rounded-full px-4 py-1.5 capitalize transition-colors', when === w ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        {rows === null ? (
          <div className="h-40 animate-pulse bg-muted/40" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No {when} bookings.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((b) => {
              const cancelled = b.status === 'cancelled'
              return (
                <div key={b.id} className={cn('flex flex-wrap items-center gap-3 bg-card px-4 py-3 text-sm', cancelled && 'opacity-55')}>
                  <div className="w-40 shrink-0">
                    <p className="font-medium">{fmtDay(b.start_time)}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{fmtTime(b.start_time)}–{fmtTime(b.end_time)}</p>
                  </div>
                  <span className="w-24 shrink-0 font-medium">{b.court_name}</span>
                  <span className="flex-1 truncate">{b.title}</span>
                  <SourceBadge source={b.source} />
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                    {b.total_fee > 0 ? `$${b.total_fee.toFixed(0)}` : '—'}
                  </span>
                  {when === 'upcoming' && !cancelled ? (
                    <button
                      type="button"
                      onClick={() => cancel(b.id)}
                      disabled={busy === b.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    >
                      {busy === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Cancel
                    </button>
                  ) : cancelled ? (
                    <span className="text-xs text-muted-foreground">Cancelled</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// --------------------------------------------------------------------------- //
//  Members — club directory (C1)                                              //
// --------------------------------------------------------------------------- //
function MembersPanel() {
  const [members, setMembers] = useState<ApiMemberDir[] | null>(null)
  useEffect(() => {
    api.listMembers().then(setMembers).catch(() => setMembers([]))
  }, [])

  const admins = (members ?? []).filter((m) => m.role === 'admin').length

  return (
    <section>
      {members === null ? (
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
      ) : (
        <>
          <div className="mb-4 flex gap-3 text-sm text-muted-foreground">
            <span><span className="font-semibold text-foreground">{members.length}</span> members</span>
            <span>·</span>
            <span><span className="font-semibold text-foreground">{admins}</span> admin{admins === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="divide-y divide-border">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 bg-card px-4 py-3">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', m.tone)}>{m.initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className="hidden w-24 shrink-0 text-xs text-muted-foreground sm:block">{m.skill_level}</span>
                  {m.role === 'admin' ? (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>
                  ) : (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Member</span>
                  )}
                  <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground md:block">Joined {fmtDay(m.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
