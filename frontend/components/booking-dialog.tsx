'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Check,
  Clock,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Users,
  CalendarCheck,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/modal'
import { cn } from '@/lib/utils'
import { players as roster, type CourtSlot } from '@/lib/club-data'

type Step = 'details' | 'done'

export function BookingDialog({
  slot,
  open,
  onClose,
  onBooked,
}: {
  slot: CourtSlot
  open: boolean
  onClose: () => void
  onBooked?: () => void
}) {
  const [step, setStep] = useState<Step>('details')
  const [splitCount, setSplitCount] = useState(slot.sport === 'padel' ? 4 : 2)
  const [invited, setInvited] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const maxSplit = slot.sport === 'padel' ? 4 : 2
  const perPerson = useMemo(
    () => (slot.price / splitCount).toFixed(2),
    [slot.price, splitCount],
  )

  function toggleInvite(id: string) {
    setInvited((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function reset() {
    setStep('details')
    setError(null)
    setInvited([])
    setSplitCount(maxSplit)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleConfirm() {
    setError(null)
    // Optimistic: jump to the confirmation immediately.
    setStep('done')
    onBooked?.()
    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 800))
      const ok = true
      if (!ok) {
        setStep('details')
        setError('The court was booked a moment ago. Try another time.')
      }
    })
  }

  return (
    <Modal open={open} onClose={handleClose} labelledBy="booking-title">
      {step === 'details' ? (
        <>
          <div className="relative">
            <img
              src={slot.image || '/placeholder.svg'}
              alt={`${slot.club} ${slot.court}`}
              className="h-40 w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium capitalize backdrop-blur">
                {slot.sport}
              </span>
              <h2
                id="booking-title"
                className="mt-2 font-serif text-2xl font-semibold tracking-tight"
              >
                {slot.club}
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-5 overflow-y-auto p-5">
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" />
                {slot.court} · {slot.surface}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4 shrink-0" />
                {slot.day}, {slot.time} · {slot.durationMins} min
              </span>
            </div>

            {/* Fee split */}
            <div className="rounded-2xl border border-border bg-secondary/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="size-4 text-primary" />
                  Split the court fee
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Fewer players"
                    onClick={() => setSplitCount((n) => Math.max(1, n - 1))}
                    disabled={splitCount <= 1}
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center font-serif text-lg font-semibold tabular-nums">
                    {splitCount}
                  </span>
                  <button
                    type="button"
                    aria-label="More players"
                    onClick={() =>
                      setSplitCount((n) => Math.min(maxSplit, n + 1))
                    }
                    disabled={splitCount >= maxSplit}
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
                <div>
                  <p className="font-serif text-2xl font-semibold">
                    ${perPerson}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    per person · ${slot.price} total
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Everyone pays their share on join
                </p>
              </div>
            </div>

            {/* Invite friends — reduces friction for recurring groups */}
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Invite your usual four
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {roster.slice(0, 5).map((p) => {
                  const active = invited.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleInvite(p.id)}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold',
                          p.tone,
                        )}
                      >
                        {p.initials}
                      </span>
                      {p.name.split(' ')[0]}
                      {active ? <Check className="size-3.5 text-primary" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            {error ? (
              <p className="text-sm font-medium text-destructive">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3 border-t border-border bg-card p-5">
            <div className="text-sm">
              <span className="font-serif text-lg font-semibold">
                ${perPerson}
              </span>{' '}
              <span className="text-muted-foreground">/ you</span>
            </div>
            <Button
              onClick={handleConfirm}
              data-icon="inline-start"
              className="ml-auto h-11 rounded-full px-6"
            >
              <CalendarCheck className="size-4" />
              Confirm booking
            </Button>
          </div>
        </>
      ) : (
        <ConfirmationView
          slot={slot}
          perPerson={perPerson}
          invitedCount={invited.length}
          pending={pending}
          onClose={handleClose}
        />
      )}
    </Modal>
  )
}

function ConfirmationView({
  slot,
  perPerson,
  invitedCount,
  pending,
  onClose,
}: {
  slot: CourtSlot
  perPerson: string
  invitedCount: number
  pending: boolean
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative flex size-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="size-9" strokeWidth={2.5} />
        </span>
      </div>

      <h2
        id="booking-title"
        className="mt-6 font-serif text-3xl font-semibold tracking-tight text-balance"
      >
        You&apos;re on the court
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
        {slot.club} · {slot.court} is booked for {slot.day} at {slot.time}.
        {invitedCount > 0
          ? ` We've pinged ${invitedCount} ${
              invitedCount === 1 ? 'friend' : 'friends'
            } to split the fee.`
          : ' Invite friends any time to split the fee.'}
      </p>

      <div className="mt-6 flex w-full max-w-xs items-center justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-left">
        <div>
          <p className="text-xs text-muted-foreground">Your share</p>
          <p className="font-serif text-lg font-semibold">${perPerson}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="flex items-center justify-end gap-1.5 text-sm font-medium text-accent">
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Confirming
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                Confirmed
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button onClick={onClose} className="h-11 rounded-full">
          Add to my games
        </Button>
        <Button
          variant="ghost"
          data-icon="inline-start"
          className="h-11 rounded-full"
        >
          <Share2 className="size-4" />
          Share with friends
        </Button>
      </div>
    </div>
  )
}
