// Multi-tenant routing: when the app is served from a club subdomain
// (riverside.acepair.ir), rewrite the site root to that club's landing page
// so visitors see the club — not the marketing home — while the URL stays
// clean. All other routes (/login, /discover, /admin, …) work unchanged; the
// JWT already carries the club, so no per-host rewriting is needed there.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'acepair.ir'
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'dashboard', 'static', 'assets', 'cdn'])

function clubFromHost(host: string): string | null {
  const h = host.split(':')[0].toLowerCase()
  if (!h.endsWith('.' + ROOT_DOMAIN)) return null
  const sub = h.slice(0, -(ROOT_DOMAIN.length + 1))
  if (!sub || sub.includes('.') || RESERVED.has(sub)) return null
  return sub
}

export function proxy(req: NextRequest) {
  const slug = clubFromHost(req.headers.get('host') || '')
  if (slug && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = `/${slug}`
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

// Only the site root needs host-aware rewriting.
export const config = { matcher: ['/'] }
