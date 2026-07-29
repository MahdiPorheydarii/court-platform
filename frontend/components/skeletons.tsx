// Lightweight loading skeletons — shown while live data is fetched so the page
// never flashes content that then disappears.
import { cn } from '@/lib/utils'

function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function MatchCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <Shimmer className="h-5 w-16 rounded-full" />
        <Shimmer className="h-5 w-20 rounded-full" />
      </div>
      <Shimmer className="h-6 w-3/4" />
      <div className="flex flex-col gap-2">
        <Shimmer className="h-4 w-2/3" />
        <Shimmer className="h-4 w-1/2" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Shimmer className="size-7 rounded-full" />
        <Shimmer className="size-7 rounded-full" />
        <Shimmer className="h-4 w-24" />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Shimmer className="h-8 w-16" />
        <Shimmer className="h-10 w-28 rounded-full" />
      </div>
    </div>
  )
}

export function GameRowSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Shimmer className="h-5 w-20 rounded-full" />
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
        <Shimmer className="h-6 w-56" />
        <Shimmer className="h-4 w-72" />
        <Shimmer className="h-7 w-32" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Shimmer className="h-6 w-20" />
        <Shimmer className="h-10 w-24 rounded-full" />
      </div>
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </>
  )
}
