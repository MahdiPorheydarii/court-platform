export type Sport = 'padel' | 'tennis'
export type Level = 'Beginner' | 'Improver' | 'Intermediate' | 'Advanced'

export type Player = {
  id: string
  name: string
  initials: string
  level: Level
  tone: string // token-based avatar background
}

export type OpenMatch = {
  id: string
  sport: Sport
  title: string
  club: string
  court: string
  day: string
  time: string
  durationMins: number
  level: Level
  pricePerPerson: number
  spotsTotal: number
  players: Player[]
  host: string
}

export type CourtSlot = {
  id: string
  sport: Sport
  club: string
  court: string
  surface: string
  day: string
  time: string
  durationMins: number
  price: number
  bookedPct: number
  image: string
  indoor: boolean
}

const P = (
  id: string,
  name: string,
  level: Level,
  tone: string,
): Player => ({
  id,
  name,
  initials: name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
  level,
  tone,
})

export const players: Player[] = [
  P('p1', 'Maya Okafor', 'Intermediate', 'bg-primary/15 text-primary'),
  P('p2', 'Léo Marchand', 'Advanced', 'bg-accent/20 text-accent'),
  P('p3', 'Sofia Ricci', 'Improver', 'bg-primary/15 text-primary'),
  P('p4', 'Dan Whitlock', 'Intermediate', 'bg-accent/20 text-accent'),
  P('p5', 'Amara Sen', 'Advanced', 'bg-primary/15 text-primary'),
  P('p6', 'Tom Brenner', 'Improver', 'bg-accent/20 text-accent'),
]

export const openMatches: OpenMatch[] = [
  {
    id: 'm1',
    sport: 'padel',
    title: 'Golden-hour doubles',
    club: 'Riverside Padel',
    court: 'Court 3 · Glass',
    day: 'Today',
    time: '6:30 PM',
    durationMins: 90,
    level: 'Intermediate',
    pricePerPerson: 14,
    spotsTotal: 4,
    players: [players[0], players[3], players[5]],
    host: 'Maya',
  },
  {
    id: 'm2',
    sport: 'tennis',
    title: 'Singles ladder — clay',
    club: 'Hillcrest Tennis',
    court: 'Court 1 · Clay',
    day: 'Tomorrow',
    time: '8:00 AM',
    durationMins: 60,
    level: 'Advanced',
    pricePerPerson: 18,
    spotsTotal: 2,
    players: [players[1]],
    host: 'Léo',
  },
  {
    id: 'm3',
    sport: 'padel',
    title: 'Friendly mixed pairs',
    club: 'Parkside Racquet',
    court: 'Court 5 · Panoramic',
    day: 'Sat',
    time: '11:00 AM',
    durationMins: 90,
    level: 'Improver',
    pricePerPerson: 12,
    spotsTotal: 4,
    players: [players[2], players[4]],
    host: 'Sofia',
  },
  {
    id: 'm4',
    sport: 'tennis',
    title: 'Sunday hitting session',
    club: 'Hillcrest Tennis',
    court: 'Court 4 · Hard',
    day: 'Sun',
    time: '9:30 AM',
    durationMins: 60,
    level: 'Intermediate',
    pricePerPerson: 16,
    spotsTotal: 2,
    players: [players[3]],
    host: 'Dan',
  },
]

export const courtSlots: CourtSlot[] = [
  {
    id: 'c1',
    sport: 'padel',
    club: 'Riverside Padel',
    court: 'Court 2',
    surface: 'Glass · Outdoor',
    day: 'Today',
    time: '7:00 PM',
    durationMins: 90,
    price: 48,
    bookedPct: 80,
    image: '/images/court-padel.png',
    indoor: false,
  },
  {
    id: 'c2',
    sport: 'tennis',
    club: 'Hillcrest Tennis',
    court: 'Court 1',
    surface: 'Clay · Outdoor',
    day: 'Tomorrow',
    time: '8:00 AM',
    durationMins: 60,
    price: 32,
    bookedPct: 45,
    image: '/images/court-clay.png',
    indoor: false,
  },
  {
    id: 'c3',
    sport: 'padel',
    club: 'Parkside Racquet',
    court: 'Court 5',
    surface: 'Panoramic · Indoor',
    day: 'Today',
    time: '9:00 PM',
    durationMins: 90,
    price: 52,
    bookedPct: 65,
    image: '/images/hero-court.png',
    indoor: true,
  },
]

export type UpcomingGame = {
  id: string
  kind: 'match' | 'court'
  role: 'host' | 'joined' | 'booked'
  sport: Sport
  title: string
  club: string
  court: string
  day: string
  time: string
  durationMins: number
  pricePerPerson: number
  players: Player[]
  spotsTotal: number
  status: 'confirmed' | 'filling'
}

export const upcomingGames: UpcomingGame[] = [
  {
    id: 'u1',
    kind: 'match',
    role: 'joined',
    sport: 'padel',
    title: 'Golden-hour doubles',
    club: 'Riverside Padel',
    court: 'Court 3 · Glass',
    day: 'Today',
    time: '6:30 PM',
    durationMins: 90,
    pricePerPerson: 14,
    players: [players[0], players[3], players[5]],
    spotsTotal: 4,
    status: 'confirmed',
  },
  {
    id: 'u2',
    kind: 'court',
    role: 'booked',
    sport: 'padel',
    title: 'Court 2 — you booked it',
    club: 'Riverside Padel',
    court: 'Court 2 · Glass',
    day: 'Tomorrow',
    time: '7:00 PM',
    durationMins: 90,
    pricePerPerson: 16,
    players: [players[0], players[2]],
    spotsTotal: 4,
    status: 'filling',
  },
  {
    id: 'u3',
    kind: 'match',
    role: 'host',
    sport: 'tennis',
    title: 'Saturday singles ladder',
    club: 'Hillcrest Tennis',
    court: 'Court 1 · Clay',
    day: 'Sat',
    time: '9:00 AM',
    durationMins: 60,
    pricePerPerson: 18,
    players: [players[1]],
    spotsTotal: 2,
    status: 'filling',
  },
]

export function levelTone(level: Level): string {
  switch (level) {
    case 'Beginner':
      return 'bg-accent/15 text-accent'
    case 'Improver':
      return 'bg-accent/15 text-accent'
    case 'Intermediate':
      return 'bg-primary/12 text-primary'
    case 'Advanced':
      return 'bg-primary/15 text-primary'
  }
}
