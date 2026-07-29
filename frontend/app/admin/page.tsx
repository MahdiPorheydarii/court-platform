'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Check,
  Loader2,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { api, ApiError, type ApiCourt } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

export default function AdminPage() {
  const { authed, member, loading } = useSession()

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
        <header className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary">
            <Building2 className="size-4" /> Club admin
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Run your club
          </h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            Configure courts, pricing, and matchmaking rules. Changes apply instantly.
          </p>
        </header>

        {!API_ENABLED ? (
          <Gate
            icon={Lock}
            title="Connect a backend to manage your club"
            body="This preview runs on demo data. Set NEXT_PUBLIC_API_URL to point AcePair at a live API, then sign in as an admin."
          />
        ) : loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !authed ? (
          <Gate
            icon={Lock}
            title="Sign in to manage your club"
            body="Club configuration is available to signed-in admins."
            action={<Link href="/login">Sign in</Link>}
          />
        ) : member?.role !== 'admin' ? (
          <Gate
            icon={Lock}
            title="Admins only"
            body="Ask a club admin for access to court and pricing settings."
          />
        ) : (
          <div className="mt-8 flex flex-col gap-8">
            <CourtsPanel />
            <RulesPanel />
          </div>
        )}
      </main>
    </div>
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
//  Courts                                                                      //
// --------------------------------------------------------------------------- //
function CourtsPanel() {
  const [courts, setCourts] = useState<ApiCourt[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [sport, setSport] = useState<'padel' | 'tennis'>('padel')
  const [surface, setSurface] = useState('Glass')
  const [indoor, setIndoor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCourts(await api.listCourts(true))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
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
      await api.createCourt({ name, sport, surface, indoor })
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add court.')
    } finally {
      setSaving(false)
    }
  }

  async function retire(court: ApiCourt) {
    await api.deleteCourt(court.id).catch(() => {})
    await load()
  }

  async function restore(court: ApiCourt) {
    await api.updateCourt(court.id, { is_active: true }).catch(() => {})
    await load()
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold">Courts</h2>
        <span className="text-sm text-muted-foreground">{courts.length} total</span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading courts…</p>
        ) : courts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No courts yet — add your first one below.
          </p>
        ) : (
          courts.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between rounded-xl border border-border px-4 py-3',
                c.is_active ? 'bg-background' : 'bg-muted/40 opacity-70',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                    c.sport === 'padel'
                      ? 'bg-primary/12 text-primary'
                      : 'bg-accent/15 text-accent',
                  )}
                >
                  {c.sport}
                </span>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.surface} · {c.indoor ? 'Indoor' : 'Outdoor'}
                    {c.is_active ? '' : ' · retired'}
                  </p>
                </div>
              </div>
              {c.is_active ? (
                <button
                  type="button"
                  onClick={() => retire(c)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Retire
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => restore(c)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Restore
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={addCourt} className="mt-5 rounded-xl border border-dashed border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a court
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Court name (e.g. Court 3)"
            required
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
          />
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value as 'padel' | 'tennis')}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            <option value="padel">Padel</option>
            <option value="tennis">Tennis</option>
          </select>
          <input
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            placeholder="Surface (e.g. Clay, Glass)"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"
          />
          <label className="flex items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={indoor}
              onChange={(e) => setIndoor(e.target.checked)}
              className="size-4 accent-primary"
            />
            Indoor court
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={saving} className="mt-3 h-10 rounded-full px-5" data-icon="inline-start">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add court
        </Button>
      </form>
    </section>
  )
}

// --------------------------------------------------------------------------- //
//  Pricing & rules                                                             //
// --------------------------------------------------------------------------- //
function RulesPanel() {
  const [config, setConfig] = useState<Record<string, any> | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(() => setConfig({}))
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

  async function save() {
    if (!config) return
    setSaving(true)
    try {
      await api.updateConfig({
        fees: config.fees,
        min_players: config.min_players,
        cancellation_window_hours: config.cancellation_window_hours,
        unfilled_policy: config.unfilled_policy,
      })
      setSaved(true)
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  if (!config) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Loading rules…</p>
      </section>
    )
  }

  const dollars = (cents: number | undefined) => (cents ? Math.round(cents / 100) : 0)

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-serif text-xl font-semibold">Pricing &amp; matchmaking rules</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Data-driven — these values shape fees and how matches confirm, with no code changes.
      </p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {(['padel', 'tennis'] as const).map((sport) => (
          <div key={sport} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold capitalize">{sport}</p>
            <div className="mt-3 flex flex-col gap-3">
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Cancellation window (hours)"
          value={config.cancellation_window_hours ?? 12}
          onChange={(v) => patch(['cancellation_window_hours'], v)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">If a match doesn't fill</span>
          <select
            value={config.unfilled_policy ?? 'cancel'}
            onChange={(e) => patch(['unfilled_policy'], e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            <option value="cancel">Cancel — no charge</option>
            <option value="partial">Present players split the whole fee</option>
            <option value="absorb">Club absorbs empty seats</option>
          </select>
        </label>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={saving} className="h-10 rounded-full px-6" data-icon="inline-start">
          {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
          {saved ? 'Saved' : 'Save rules'}
        </Button>
        {saved ? <span className="text-sm text-accent">Your changes are live.</span> : null}
      </div>
    </section>
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
