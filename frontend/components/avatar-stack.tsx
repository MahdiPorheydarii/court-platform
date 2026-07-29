import type { Player } from '@/lib/club-data'
import { cn } from '@/lib/utils'

export function AvatarStack({
  players,
  emptySpots = 0,
  size = 'md',
  className,
}: {
  players: Player[]
  emptySpots?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const dim = size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs'
  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2.5">
        {players.map((p) => (
          <span
            key={p.id}
            title={`${p.name} · ${p.level}`}
            className={cn(
              'inline-flex items-center justify-center rounded-full border-2 border-card font-semibold ring-1 ring-border/60',
              dim,
              p.tone,
            )}
          >
            {p.initials}
          </span>
        ))}
        {Array.from({ length: emptySpots }).map((_, i) => (
          <span
            key={`empty-${i}`}
            className={cn(
              'inline-flex items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/60 font-medium text-muted-foreground',
              dim,
            )}
            aria-hidden="true"
          >
            +
          </span>
        ))}
      </div>
    </div>
  )
}
