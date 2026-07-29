import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The AcePair mark: two overlapping discs — one clay, one court-sage — that
 * read as a "pair". A single seam keeps it grounded in the sport rather than a
 * generic Venn diagram.
 */
export function AceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role="img"
      aria-label="AcePair"
    >
      <circle cx="12.5" cy="16" r="7" className="fill-primary" />
      <circle cx="19.5" cy="16" r="7" className="fill-accent" fillOpacity="0.9" />
      <path
        d="M16 9.6 C 17.7 12, 17.7 20, 16 22.4"
        className="stroke-background"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function Logo({
  className,
  href = '/',
  markClassName,
}: {
  className?: string
  href?: string | null
  markClassName?: string
}) {
  const inner = (
    <span className={cn('flex items-center gap-2', className)}>
      <AceMark className={markClassName} />
      <span className="font-serif text-xl font-semibold tracking-tight">AcePair</span>
    </span>
  )
  if (href === null) return inner
  return (
    <Link href={href} className="flex items-center">
      {inner}
    </Link>
  )
}
