'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellRing, Check } from 'lucide-react'
import { Popover } from '@/components/popover'
import { api, type ApiNotification } from '@/lib/api'
import { API_ENABLED } from '@/lib/config'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function NotificationsBell() {
  const { authed } = useSession()
  const live = authed && API_ENABLED
  const [items, setItems] = useState<ApiNotification[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    if (!live) return
    try {
      const data = await api.notifications()
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* stay quiet — the bell just shows no new items */
    }
  }, [live])

  useEffect(() => {
    if (!live) return
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [live, load])

  const markRead = useCallback(async () => {
    if (!live || unread === 0) return
    try {
      await api.markAllRead()
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    } catch {
      /* ignore */
    }
  }, [live, unread])

  return (
    <Popover
      triggerLabel="Notifications"
      triggerClassName="relative flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      triggerContent={
        <>
          {unread > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-serif text-lg font-semibold">Notifications</p>
          {live && unread > 0 ? (
            <button
              type="button"
              onClick={markRead}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Check className="size-3.5" />
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!live ? (
            <Empty
              title="Sign in to see updates"
              body="Match confirmations, booking changes, and cancellations land here in real time."
            />
          ) : items.length === 0 ? (
            <Empty
              title="You're all caught up"
              body="New match fills and booking updates will show up here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex gap-3 px-4 py-3',
                    n.read_at ? '' : 'bg-primary/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.read_at ? 'bg-transparent' : 'bg-primary',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body ? (
                      <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Popover>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bell className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
