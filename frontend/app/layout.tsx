import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Fraunces } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/lib/session'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz', 'SOFT'],
})

export const metadata: Metadata = {
  title: 'AcePair — Never play alone',
  description:
    'AcePair is the members club for tennis and padel. Find your next match, join open games, split the court, and book in a single tap.',
  applicationName: 'AcePair',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f4ede0',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`light ${geistSans.variable} ${fraunces.variable}`}>
      <body className="bg-background font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
