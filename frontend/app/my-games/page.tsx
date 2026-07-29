import { AppHeader } from '@/components/app-header'
import { MyGames } from '@/components/my-games'

export const metadata = {
  title: 'My games · AcePair',
  description: 'Your upcoming tennis and padel matches, hosted games, and court bookings.',
}

export default function MyGamesPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <MyGames />
    </div>
  )
}
