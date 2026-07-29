'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { NotificationsBell } from '@/components/notifications-bell'
import { ProfileMenu } from '@/components/profile-menu'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Discover', href: '/discover' },
  { label: 'My games', href: '/my-games' },
  { label: 'Club admin', href: '/admin', adminOnly: true },
]

export function AppHeader() {
  const pathname = usePathname()
  const { member } = useSession()
  const isAdmin = member?.role === 'admin'
  const items = navItems.filter((item) => !item.adminOnly || isAdmin)
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'transition-colors hover:text-foreground',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <NotificationsBell />
          <ProfileMenu />
        </div>
      </div>
    </header>
  )
}
