'use client'

import Link from 'next/link'
import { CalendarDays, LogOut, Settings2, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover } from '@/components/popover'
import { useSession } from '@/lib/session'

export function ProfileMenu() {
  const { authed, member, logout } = useSession()

  if (!authed || !member) {
    return (
      <Button asChild className="h-9 rounded-full px-4">
        <Link href="/login">Log in</Link>
      </Button>
    )
  }

  const isAdmin = member.role === 'admin'

  return (
    <Popover
      triggerLabel="Account menu"
      triggerClassName="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:border-primary/40"
      triggerContent={
        <>
          <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
            {member.initials}
          </span>
          <span className="hidden max-w-[8rem] truncate sm:inline">
            {member.name.split(' ')[0]}
          </span>
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {member.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{member.name}</p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
          </div>
          <nav className="flex flex-col p-1.5">
            <MenuLink href="/my-games" icon={CalendarDays} onClick={close}>
              My games
            </MenuLink>
            <MenuLink href="/discover" icon={UserRound} onClick={close}>
              Discover
            </MenuLink>
            {isAdmin ? (
              <MenuLink href="/admin" icon={Settings2} onClick={close}>
                Club admin
              </MenuLink>
            ) : null}
          </nav>
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                logout()
                close()
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

function MenuLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </Link>
  )
}
