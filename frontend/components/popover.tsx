'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function Popover({
  triggerContent,
  triggerClassName,
  triggerLabel,
  panelClassName,
  children,
}: {
  triggerContent: React.ReactNode
  triggerClassName?: string
  triggerLabel: string
  panelClassName?: string
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
      {open ? (
        <div
          className={cn(
            'absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/5 animate-in fade-in slide-in-from-top-1',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  )
}
