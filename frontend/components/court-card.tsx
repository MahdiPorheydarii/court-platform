'use client'

import { useState } from 'react'
import { Check, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BookingDialog } from '@/components/booking-dialog'
import { cn } from '@/lib/utils'
import type { CourtSlot } from '@/lib/club-data'

export function CourtCard({ slot }: { slot: CourtSlot }) {
  const [open, setOpen] = useState(false)
  const [booked, setBooked] = useState(false)

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg hover:shadow-primary/5">
      <div className="relative">
        <img
          src={slot.image || '/placeholder.svg'}
          alt={`${slot.club} ${slot.court}, ${slot.surface}`}
          loading="lazy"
          className="aspect-[16/10] w-full bg-muted object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-foreground/40 to-transparent" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium capitalize backdrop-blur">
          {slot.sport}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-card/90 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
          {slot.indoor ? 'Indoor' : 'Outdoor'}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-serif text-xl font-semibold tracking-tight">
          {slot.club}
        </h3>
        <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {slot.court} · {slot.surface}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
            {slot.day}, {slot.time} · {slot.durationMins} min
          </span>
        </div>

        {/* Social proof at a glance */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              {slot.bookedPct}% booked this week
            </span>
            {slot.bookedPct >= 75 ? (
              <span className="font-semibold text-primary">Filling fast</span>
            ) : null}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${slot.bookedPct}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="font-serif text-lg font-semibold">${slot.price}</p>
            <p className="text-xs text-muted-foreground">per court · {slot.durationMins} min</p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            data-icon="inline-start"
            className={cn(
              'h-10 rounded-full px-5',
              booked && 'bg-accent text-accent-foreground',
            )}
          >
            {booked ? <Check className="size-4" /> : null}
            {booked ? 'Booked' : 'Book court'}
          </Button>
        </div>
      </div>

      <BookingDialog
        slot={slot}
        open={open}
        onClose={() => setOpen(false)}
        onBooked={() => setBooked(true)}
      />
    </article>
  )
}
