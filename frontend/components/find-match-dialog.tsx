'use client'

import { useEffect, useState } from 'react'
import {
  CalendarClock,
  Check,
  Loader2,
  Radar,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/modal'
import { api, ApiError, type ApiMatch } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { levelTone, type Level, type Sport } from '@/lib/club-data'
import { dayLabel, timeLabel } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const sports: Sport[] = ['padel', 'tennis']
const levels: Level[] = ['Beginner', 'Improver', 'Intermediate', 'Advanced']
const days = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'Weekend' },
] as const
const bands = [
  { key: 'morning', label: 'Morning', range: [8, 12] },
  { key: 'afternoon', label: 'Afternoon', range: [12, 17] },
  { key: 'evening', label: 'Evening', range: [17, 21] },
] as const

function windowFor(dayKey: string, bandKey: string) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (dayKey === 'tomorrow') base.setDate(base.getDate() + 1)
  if (dayKey === 'weekend') base.setDate(base.getDate() + ((6 - base.getDay() + 7) % 7))
  const band = bands.find((b) => b.key === bandKey) ?? bands[2]
  const earliest = new Date(base)
  earliest.setHours(band.range[0], 0, 0, 0)
  const latest = new Date(base)
  latest.setHours(band.range[1], 0, 0, 0)
  if (earliest.getTime() < now.getTime()) earliest.setTime(now.getTime())
  return { earliest: earliest.toISOString(), latest: latest.toISOString() }
}

type Outcome = { status: 'confirmed' | 'forming' | 'posted'; match?: ApiMatch }

export function FindMatchDialog({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean
  onClose: () => void
  onSubmitted?: () => void
}) {
  const { member, updateMember } = useSession()
  const [step, setStep] = useState<'setup' | 'result'>('setup')
  const [sport, setSport] = useState<Sport>('padel')
  const [level, setLevel] = useState<Level>((member?.skill_level as Level) ?? 'Intermediate')
  const [day, setDay] = useState<string>('today')
  const [band, setBand] = useState<string>('evening')
  const [duration, setDuration] = useState(90)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Outcome | null>(null)

  // Pre-fill the level from the saved profile (still editable here).
  useEffect(() => {
    if (member?.skill_level) setLevel(member.skill_level as Level)
  }, [member?.skill_level])

  function reset() {
    setStep('setup')
    setError(null)
    setResult(null)
  }
  function handleClose() {
    reset()
    onClose()
  }

  async function submit() {
    setPending(true)
    setError(null)
    try {
      // Persist skill level so it's remembered next time.
      if (API_ENABLED && member && level !== member.skill_level) {
        const r = await api.updateMe({ skill_level: level })
        updateMember(r.member)
      }
      if (!API_ENABLED) {
        setResult({ status: 'posted' })
        setStep('result')
        return
      }
      const { earliest, latest } = windowFor(day, band)
      const res = await api.postRequest({
        sport,
        earliest_start: earliest,
        latest_start: latest,
        duration_mins: duration,
        skill_level: level,
      })
      setResult({
        status: res.confirmed ? 'confirmed' : res.match ? 'forming' : 'posted',
        match: res.match ?? undefined,
      })
      setStep('result')
      onSubmitted?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post your request. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} labelledBy="find-title">
      {step === 'setup' ? (
        <div className="flex flex-col">
          <div className="border-b border-border p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <Radar className="size-3.5" />
              Looking for players
            </span>
            <h2 id="find-title" className="mt-2 font-serif text-2xl font-semibold tracking-tight">
              Find a match
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us your game — AcePair groups you with players at your level.
            </p>
          </div>

          <div className="flex flex-col gap-5 overflow-y-auto p-5">
            <Field label="Sport">
              <div className="flex gap-2">
                {sports.map((s) => (
                  <Segment key={s} active={sport === s} onClick={() => setSport(s)}>
                    <span className="capitalize">{s}</span>
                  </Segment>
                ))}
              </div>
            </Field>

            <Field label="Your level" hint="Saved to your profile">
              <div className="flex flex-wrap gap-2">
                {levels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(l)}
                    aria-pressed={level === l}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                      level === l
                        ? levelTone(l) + ' ring-1 ring-primary/40'
                        : 'bg-secondary text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="When can you play?">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {days.map((d) => (
                    <Segment key={d.key} active={day === d.key} onClick={() => setDay(d.key)}>
                      {d.label}
                    </Segment>
                  ))}
                </div>
                <div className="flex gap-2">
                  {bands.map((b) => (
                    <Segment key={b.key} active={band === b.key} onClick={() => setBand(b.key)}>
                      {b.label}
                    </Segment>
                  ))}
                </div>
              </div>
            </Field>

            <Field label="Duration">
              <div className="flex gap-2">
                {[60, 90].map((d) => (
                  <Segment key={d} active={duration === d} onClick={() => setDuration(d)}>
                    {d} min
                  </Segment>
                ))}
              </div>
            </Field>

            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          </div>

          <div className="flex items-center gap-3 border-t border-border p-5">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="size-4" />
              {days.find((d) => d.key === day)?.label} · {bands.find((b) => b.key === band)?.label}
            </div>
            <Button
              onClick={submit}
              disabled={pending}
              data-icon="inline-start"
              className="ml-auto h-11 rounded-full px-6"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Find players
            </Button>
          </div>
        </div>
      ) : (
        <ResultView result={result!} onClose={handleClose} onAgain={reset} />
      )}
    </Modal>
  )
}

function ResultView({
  result,
  onClose,
  onAgain,
}: {
  result: Outcome
  onClose: () => void
  onAgain: () => void
}) {
  const confirmed = result.status === 'confirmed'
  const forming = result.status === 'forming'
  const m = result.match

  const title = confirmed
    ? 'Your match is set!'
    : forming
      ? 'You joined a forming match'
      : 'Request posted'
  const body = confirmed
    ? 'Everyone confirmed. It’s on your calendar and the court fee is split evenly.'
    : forming
      ? 'You’re in — we’ll confirm the moment it reaches enough players.'
      : 'We’ll ping you the second compatible players show up. Hang tight.'

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative flex size-20 items-center justify-center">
        <span
          className={cn(
            'absolute inset-0 rounded-full',
            confirmed ? 'animate-ping bg-accent/20' : 'animate-pulse bg-primary/15',
          )}
        />
        <span
          className={cn(
            'relative flex size-20 items-center justify-center rounded-full',
            confirmed ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground',
          )}
        >
          {confirmed ? <Check className="size-9" strokeWidth={2.5} /> : <Sparkles className="size-8" />}
        </span>
      </div>

      <h2 id="find-title" className="mt-6 font-serif text-3xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      <p className="mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>

      {m ? (
        <div className="mt-6 w-full max-w-xs rounded-2xl border border-border bg-secondary/40 p-4 text-left">
          <p className="font-serif text-lg font-semibold">{m.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {m.court_name ? `${m.court_name} · ` : ''}
            {dayLabel(m.start_time)}, {timeLabel(m.start_time)}
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-sm">
            <Users className="size-4 text-primary" />
            <span className="font-medium">
              {m.spots_filled} of {m.spots_total} players
            </span>
            {m.price_per_person != null ? (
              <span className="ml-auto text-muted-foreground">${m.price_per_person}/person</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button onClick={onClose} className="h-11 rounded-full">
          {confirmed || forming ? 'View my games' : 'Done'}
        </Button>
        <Button variant="ghost" onClick={onAgain} className="h-11 rounded-full">
          Post another
        </Button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {hint ? <span className="normal-case tracking-normal text-muted-foreground/70">{hint}</span> : null}
      </p>
      {children}
    </div>
  )
}

function Segment({
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
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
