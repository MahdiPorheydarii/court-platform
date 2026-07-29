import { Check } from 'lucide-react'

/**
 * The celebratory overlay shown the instant a match locks in — a radiating
 * spark burst behind a checkmark, in court-sage. Used on match cards, the
 * poster page, and anywhere a match confirms live.
 */
export function ConfirmBurst({ subtitle = 'Court booked · fee split evenly' }: { subtitle?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card/95 text-center backdrop-blur-sm animate-in fade-in zoom-in-95">
      <div className="relative flex size-16 items-center justify-center">
        {/* radiating spark ring */}
        <div className="pointer-events-none absolute inset-0 animate-[burst_0.7s_ease-out_forwards]">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ transform: `rotate(${i * 36}deg) translateY(-34px)` }}
            />
          ))}
        </div>
        <span className="absolute inset-0 rounded-full bg-accent/25 animate-ping" />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground animate-in zoom-in-50">
          <Check className="size-8" strokeWidth={2.6} />
        </span>
      </div>
      <p className="font-serif text-lg font-semibold">Match locked in!</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}
