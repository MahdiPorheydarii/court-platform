import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { FeedPreview } from '@/components/landing/feed-preview'
import { Closing, SiteFooter } from '@/components/landing/closing'

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <FeedPreview />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
