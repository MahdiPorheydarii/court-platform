'use client'

import { useState, useTransition } from 'react'
import {
  Check,
  Loader2,
  Radar,
  Users,
  Zap,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/modal'
import { cn } from '@/lib/utils'
import { courtSlots, levelTone, type Level, type Sport } from '@/lib/club-data'

type Step = 'setup' | 'searching'

const sports: Sport[] = ['padel', 'tennis']
const levels: Level[] = ['Improver', 'Intermediate', 'Advanced']

export function HostMatchDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>('setup')
  const [sport, setSport] = useState<Sport>('padel')
  const [level, setLevel] = useState<Level>('Intermediate')
  const [slotId, setSlotId] = useState(courtSlots[0].id)
  const [found, setFound] = useState(0)
  const [pending, startTransition] = useTransition()

  const options = courtSlots.filter((c) => c.sport === sport)
  const activeSlot =
    options.find((c) => c.id === slotId) ?? options[0]
  const spotsWanted = sport === 'padel' ? 3 : 1

  function reset() {
    setStep('setup')
    setFound(0)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handlePublish() {
    // Optimistic: publish the request and start "finding players" immediately.
    setStep('searching')
    startTransition(async () => {
      // Simulate players trickling in.
      for (let i = 1; i <= spotsWanted; i++) {
        await new Promise((r) => setTimeout(r, 650))
        setFound(i)
      }
    })
  }

  // Keep a valid slot selected when the sport changes.
  function pickSport(s: Sport) {
    setSport(s)
    const first = courtSlots.find((c) => c.sport === s)
    if (first) setSlotId(first.id)
  }

  return (
    <Modal open={open} onClose={handleClose} labelledBy="host-title">
      {step === 'setup' ? (
        <div className="flex flex-col">
          <div className="border-b border-border p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <Radar className="size-3.5" />
              Looking for players
            </span>
            <h2
              id="host-title"
              className="mt-2 font-serif text-2xl font-semibold tracking-tight"
            >
              Host a match
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set it up once — we&apos;ll find players at your level.
            </p>
          </div>

          <div className="flex flex-col gap-5 overflow-y-auto p-5">
            <Field label="Sport">
              <div className="flex gap-2">
                {sports.map((s) => (
                  <Segment
                    key={s}
                    active={sport === s}
                    onClick={() => pickSport(s)}
                  >
                    <span className="capitalize">{s}</span>
                  </Segment>
                ))}
              </div>
            </Field>

            <Field label="Your level">
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

            <Field label="When & where">
              <div className="flex flex-col gap-2">
                {options.map((c) => {
                  const active = c.id === activeSlot?.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSlotId(c.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40',
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {c.club} · {c.court}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.day}, {c.time} · {c.durationMins} min
                        </p>
                      </div>
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-full border',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>

          <div className="flex items-center gap-3 border-t border-border p-5">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-4" />
              Need {spotsWanted} player{spotsWanted > 1 ? 's' : ''}
            </div>
            <Button
              onClick={handlePublish}
              data-icon="inline-start"
              className="ml-auto h-11 rounded-full px-6"
            >
              <Zap className="size-4" />
              Find players
            </Button>
          </div>
        </div>
      ) : (
        <SearchingView
          sport={sport}
          level={level}
          slotLabel={
            activeSlot
              ? `${activeSlot.club} · ${activeSlot.day}, ${activeSlot.time}`
              : ''
          }
          found={found}
          total={spotsWanted}
          pending={pending}
          onClose={handleClose}
        />
      )}
    </Modal>
  )
}

function SearchingView({
  sport,
  level,
  slotLabel,
  found,
  total,
  pending,
  onClose,
}: {
  sport: Sport
  level: Level
  slotLabel: string
  found: number
  total: number
  pending: boolean
  onClose: () => void
}) {
  const complete = found >= total
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {!complete ? (
          <>
            <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
            <span className="absolute inset-2 rounded-full bg-primary/10 animate-pulse" />
          </>
        ) : (
          <span className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
        )}
        <span
          className={cn(
            'relative flex size-20 items-center justify-center rounded-full',
            complete
              ? 'bg-accent text-accent-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {complete ? (
            <Check className="size-9" strokeWidth={2.5} />
          ) : (
            <Radar className="size-8 animate-spin [animation-duration:3s]" />
          )}
        </span>
      </div>

      <h2
        id="host-title"
        className="mt-6 font-serif text-3xl font-semibold tracking-tight text-balance"
      >
        {complete ? 'Your match is set' : 'Finding your players…'}
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
        {complete
          ? 'Everyone confirmed. It is on your calendar and the group chat is open.'
          : `Pinging ${level.toLowerCase()} ${sport} players near you. This usually takes seconds.`}
      </p>

      <p className="mt-4 text-xs text-muted-foreground">{slotLabel}</p>

      <div className="mt-5 flex w-full max-w-xs items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < found ? 'bg-accent' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-sm font-medium">
        <span className={complete ? 'text-accent' : 'text-primary'}>
          {found}
        </span>{' '}
        of {total} joined
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        {complete ? (
          <Button onClick={onClose} className="h-11 rounded-full">
            View match
          </Button>
        ) : (
          <Button
            disabled
            data-icon="inline-start"
            className="h-11 rounded-full"
          >
            <Loader2 className="size-4 animate-spin" />
            Matching
          </Button>
        )}
        <Button
          variant="ghost"
          data-icon="inline-start"
          className="h-11 rounded-full"
          disabled={pending && !complete}
        >
          <Send className="size-4" />
          Invite a friend to fill a spot
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
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
        'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
