import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Circular fill meter for a forming match. The arc sweeps to the current
 * fill; when the match locks (confirmed) it completes in court-sage with a
 * check and a soft pulse. The whole point is that it animates live as players
 * join over the WebSocket.
 */
export function MatchFillRing({
  filled,
  total,
  confirmed,
  justConfirmed,
  size = 56,
}: {
  filled: number
  total: number
  confirmed?: boolean
  justConfirmed?: boolean
  size?: number
}) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = Math.min(1, total > 0 ? filled / total : 0)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {justConfirmed ? (
        <span className="absolute inset-0 rounded-full bg-accent/30 animate-ping" />
      ) : null}
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-muted" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={cn(
            'fill-none transition-[stroke-dasharray] duration-700 ease-out',
            confirmed ? 'stroke-accent' : 'stroke-primary',
          )}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {confirmed ? (
          <Check className="size-5 text-accent" strokeWidth={2.6} />
        ) : (
          <span className="text-sm font-semibold tabular-nums leading-none">
            {filled}
            <span className="text-muted-foreground">/{total}</span>
          </span>
        )}
      </div>
    </div>
  )
}
