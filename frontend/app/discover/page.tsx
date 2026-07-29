import { AppHeader } from '@/components/app-header'
import { DiscoverFeed } from '@/components/discover-feed'

export default function DiscoverPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex-1">
        <DiscoverFeed />
      </main>
    </div>
  )
}
