// Typed AcePair API client. Every call attaches the bearer token and surfaces
// the backend's structured error body as a thrown ApiError.
import { API_BASE, TOKEN_KEY } from './config'
import type { CourtSlot, OpenMatch, Player, Sport, UpcomingGame, Level } from './club-data'
import { dayLabel, timeLabel } from './format'

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const token = options.token ?? (auth ? getToken() : null)
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const err = data?.error ?? {}
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? res.statusText, err.details)
  }
  return data as T
}

// --- Shapes (mirror backend schemas, loosely typed) ---
export interface ApiMember {
  id: string
  name: string
  email: string
  role: string
  skill_level: string
  tone: string
  initials: string
}
export interface ApiClub {
  id: string
  name: string
  slug: string
  config: Record<string, unknown>
}
export interface ApiPlayer {
  id: string
  name: string
  initials: string
  level: string
  tone: string
}
export interface ApiMatch {
  id: string
  sport: Sport
  title: string
  club_name: string
  court_name: string | null
  skill_level: string
  start_time: string
  end_time: string
  duration_mins: number
  status: string
  min_players: number
  max_players: number
  spots_total: number
  spots_filled: number
  spots_left: number
  price_per_person_cents: number | null
  price_per_person: number | null
  host_name: string | null
  players: ApiPlayer[]
  booking_id: string | null
  created_at: string
}
export interface ApiSlot {
  court_id: string
  court_name: string
  sport: Sport
  surface: string
  indoor: boolean
  image_url: string | null
  start_time: string
  end_time: string
  duration_mins: number
  is_peak: boolean
  price_cents: number
  price: number
  available: boolean
}
export interface ApiCourt {
  id: string
  name: string
  sport: string
  surface: string
  indoor: boolean
  image_url: string | null
  is_active: boolean
}
export interface ApiNotification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}
export interface ApiGame {
  id: string
  kind: 'match' | 'court'
  role: 'host' | 'joined' | 'booked'
  sport: Sport
  title: string
  club_name: string
  court_name: string | null
  start_time: string
  end_time: string
  duration_mins: number
  status: string
  spots_total: number
  spots_filled: number
  price_per_person_cents: number | null
  price_per_person: number | null
  players: ApiPlayer[]
  booking_id?: string | null
  match_id?: string | null
}
export interface TokenResponse {
  access_token: string
  token_type: string
  member: ApiMember
  club: ApiClub
}

// --- Auth ---
export const api = {
  login: (slug: string, email: string, password: string) =>
    request<TokenResponse>('/v1/auth/login', {
      method: 'POST',
      auth: false,
      body: { slug, email, password },
    }),
  registerClub: (payload: {
    club_name: string
    slug: string
    admin_name: string
    admin_email: string
    admin_password: string
  }) => request<TokenResponse>('/v1/clubs', { method: 'POST', auth: false, body: payload }),
  me: (token?: string) =>
    request<{ member: ApiMember; club: ApiClub }>('/v1/auth/me', { token }),

  // --- Discovery ---
  listMatches: (status = 'open', sport?: Sport) =>
    request<ApiMatch[]>(
      `/v1/matches?status=${status}${sport ? `&sport=${sport}` : ''}`,
    ),
  getMatch: (id: string) => request<ApiMatch>(`/v1/matches/${id}`),
  joinMatch: (id: string) => request<ApiMatch>(`/v1/matches/${id}/join`, { method: 'POST' }),
  leaveMatch: (id: string) => request<unknown>(`/v1/matches/${id}/leave`, { method: 'POST' }),
  hostMatch: (payload: {
    sport: Sport
    start_time: string
    duration_mins?: number
    court_id?: string
    skill_level?: string
    title?: string
  }) => request<ApiMatch>('/v1/matches', { method: 'POST', body: payload }),
  postRequest: (payload: {
    sport: Sport
    earliest_start: string
    latest_start: string
    duration_mins?: number
    skill_level?: string
    court_id?: string
  }) => request<{ request: unknown; match: ApiMatch | null; confirmed: boolean }>(
    '/v1/match-requests',
    { method: 'POST', body: payload },
  ),
  availability: (sport?: Sport, days = 3) =>
    request<ApiSlot[]>(`/v1/availability?days=${days}${sport ? `&sport=${sport}` : ''}`),
  createBooking: (payload: {
    court_id: string
    start_time: string
    duration_mins?: number
    split_count?: number
    title?: string
    invite_member_ids?: string[]
  }) => request<unknown>('/v1/bookings', { method: 'POST', body: payload }),

  // --- My games ---
  myGames: (when: 'upcoming' | 'past' = 'upcoming') =>
    request<ApiGame[]>(`/v1/me/games?when=${when}`),

  // --- Notifications ---
  notifications: () =>
    request<{ items: ApiNotification[]; unread: number }>('/v1/notifications'),
  markAllRead: () => request<unknown>('/v1/notifications/read-all', { method: 'POST' }),

  // --- Admin ---
  listCourts: (includeInactive = false) =>
    request<ApiCourt[]>(`/v1/courts?include_inactive=${includeInactive}`),
  createCourt: (payload: {
    name: string
    sport: string
    surface?: string
    indoor?: boolean
    image_url?: string
  }) => request<ApiCourt>('/v1/courts', { method: 'POST', body: payload }),
  updateCourt: (id: string, payload: Record<string, unknown>) =>
    request<ApiCourt>(`/v1/courts/${id}`, { method: 'PATCH', body: payload }),
  deleteCourt: (id: string) => request<void>(`/v1/courts/${id}`, { method: 'DELETE' }),
  getConfig: () => request<Record<string, any>>('/v1/club/config'),
  updateConfig: (config: Record<string, unknown>) =>
    request<ApiClub>('/v1/club/config', { method: 'PATCH', body: { config } }),
}

// --- Mappers: API shapes -> the frontend's demo-data shapes ---
export function matchToOpenMatch(m: ApiMatch): OpenMatch {
  return {
    id: m.id,
    sport: m.sport,
    title: m.title,
    club: m.club_name,
    court: m.court_name ?? 'To be assigned',
    day: dayLabel(m.start_time),
    time: timeLabel(m.start_time),
    durationMins: m.duration_mins,
    level: (m.skill_level as Level) ?? 'Intermediate',
    pricePerPerson: m.price_per_person ?? 0,
    spotsTotal: m.spots_total,
    players: m.players.map(toPlayer),
    host: m.host_name?.split(' ')[0] ?? '',
  }
}

export function slotToCourtSlot(s: ApiSlot): CourtSlot {
  return {
    id: `${s.court_id}-${s.start_time}`,
    sport: s.sport,
    club: s.court_name,
    court: s.court_name,
    surface: s.surface,
    day: dayLabel(s.start_time),
    time: timeLabel(s.start_time),
    durationMins: s.duration_mins,
    price: Math.round(s.price),
    bookedPct: s.available ? 40 : 100,
    image:
      s.image_url ||
      (s.sport === 'padel' ? '/images/court-padel.png' : '/images/court-clay.png'),
    indoor: s.indoor,
  }
}

export function gameToUpcoming(g: ApiGame): UpcomingGame {
  return {
    id: g.id,
    kind: g.kind,
    role: g.role,
    sport: g.sport,
    title: g.title,
    club: g.club_name,
    court: g.court_name ?? '',
    day: dayLabel(g.start_time),
    time: timeLabel(g.start_time),
    durationMins: g.duration_mins,
    pricePerPerson: g.price_per_person ?? 0,
    players: g.players.map(toPlayer),
    spotsTotal: g.spots_total,
    status: g.status === 'confirmed' ? 'confirmed' : 'filling',
  }
}

function toPlayer(p: ApiPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    initials: p.initials,
    level: (p.level as Level) ?? 'Intermediate',
    tone: p.tone,
  }
}
