// Resolve a club from the hostname so a club can live on its own subdomain
// (riverside.acepair.ir) as well as at a path (acepair.ir/riverside).
//
// The root domain is inlined at build time; it defaults to the production
// domain so the app works without extra configuration.
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'acepair.ir'

// Subdomains that are the platform itself, never a club.
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'dashboard', 'static', 'assets', 'cdn'])

/**
 * Return the club slug encoded in a host like `riverside.acepair.ir`, or null
 * for the apex, a reserved subdomain, localhost, or a preview/IP host.
 */
export function clubSlugFromHost(host?: string): string | null {
  const raw = host ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const h = raw.split(':')[0].toLowerCase()
  if (!h || !h.endsWith('.' + ROOT_DOMAIN)) return null
  const sub = h.slice(0, -(ROOT_DOMAIN.length + 1))
  // A single label only — no nested subdomains, no reserved names.
  if (!sub || sub.includes('.') || RESERVED.has(sub)) return null
  return sub
}
