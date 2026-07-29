import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link href="/discover" className="transition-colors hover:text-foreground">
            Find a match
          </Link>
          <Link href="/discover" className="transition-colors hover:text-foreground">
            Book a court
          </Link>
          <Link href="/" className="transition-colors hover:text-foreground">
            Membership
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            className="hidden text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="rounded-full px-5">
            <Link href="/discover">Enter the club</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
