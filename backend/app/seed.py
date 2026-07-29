"""Idempotent demo seeding.

On first boot this creates a demo club ("AcePair Riverside") with courts,
members, and a few open matches so the deployed instance — and the frontend
pointed at it — feels alive immediately. Safe to run every boot: it no-ops if
the demo club already exists.

Demo login:
    club slug : riverside
    email     : alex@riverside.club
    password  : value of the SEED_DEMO_PASSWORD env var
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .domain.config import DEFAULT_CONFIG
from .models import (
    Club,
    Court,
    Match,
    MatchParticipant,
    MatchStatus,
    Member,
    Role,
)
from .security import hash_password

logger = logging.getLogger("acepair.seed")

DEMO_SLUG = "riverside"


def _next_weekday(base: datetime, weekday: int, hour: int, minute: int = 0) -> datetime:
    days_ahead = (weekday - base.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    target = base + timedelta(days=days_ahead)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


# A few more clubs so the platform showcase is a real, multi-tenant directory
# rather than one club. Each is lightweight: courts, a handful of members, and
# one or two open games (kept below min_players so they stay open).
_EXTRA_CLUBS = [
    {
        "name": "Sundown Padel", "slug": "sundown", "sports": ["padel"],
        "location": "Marbella", "tagline": "Golden-hour padel a few steps from the sea.",
        "cover_image": "/images/court-padel.jpg",
        "courts": [("Court 1", "padel"), ("Court 2", "padel"), ("Court 3", "padel"), ("Court 4", "padel")],
        "members": [("Lucia Gomez", "Advanced"), ("Diego Torres", "Intermediate"), ("Hana Kim", "Improver")],
        "matches": [
            {"title": "Sunset doubles", "sport": "padel", "skill": "Intermediate", "court": 0,
             "day": 0, "hour": 18, "dur": 90, "players": [1, 2]},
        ],
    },
    {
        "name": "Northside Tennis", "slug": "northside", "sports": ["tennis"],
        "location": "Brooklyn, NY", "tagline": "Clay and hard courts in the heart of the city.",
        "cover_image": "/images/court-clay.jpg",
        "courts": [("Court A", "tennis"), ("Court B", "tennis"), ("Court C", "tennis")],
        "members": [("Marcus Bell", "Advanced"), ("Aisha Rahman", "Intermediate"), ("Tomas Novak", "Improver")],
        "matches": [
            {"title": "Morning singles", "sport": "tennis", "skill": "Advanced", "court": 0,
             "day": 5, "hour": 8, "dur": 60, "players": [0]},
        ],
    },
    {
        "name": "Harbour Racquets", "slug": "harbour", "sports": ["padel", "tennis"],
        "location": "Lisbon", "tagline": "Padel and tennis on the waterfront.",
        "cover_image": "/images/players.jpg",
        "courts": [("Court 1", "padel"), ("Court 2", "padel"), ("Court 3", "padel"),
                   ("Baseline 1", "tennis"), ("Baseline 2", "tennis")],
        "members": [("Sofia Almeida", "Intermediate"), ("Rui Costa", "Advanced"),
                    ("Ingrid Larsen", "Improver"), ("Kofi Mensah", "Intermediate")],
        "matches": [
            {"title": "Waterfront doubles", "sport": "padel", "skill": "Intermediate", "court": 0,
             "day": 1, "hour": 18, "dur": 90, "players": [0, 3]},
            {"title": "Baseline singles", "sport": "tennis", "skill": "Advanced", "court": 3,
             "day": 2, "hour": 8, "dur": 60, "players": [1]},
        ],
    },
    {
        "name": "Vantage Padel Club", "slug": "vantage", "sports": ["padel"],
        "location": "Dubai", "tagline": "Rooftop panoramic padel, floodlit after dark.",
        "cover_image": "/images/hero-court.jpg",
        "courts": [("Sky 1", "padel"), ("Sky 2", "padel"), ("Sky 3", "padel"), ("Sky 4", "padel")],
        "members": [("Omar Haddad", "Advanced"), ("Lena Fischer", "Intermediate"), ("Priyanka Rao", "Improver")],
        "matches": [
            {"title": "Floodlit padel", "sport": "padel", "skill": "Intermediate", "court": 0,
             "day": 4, "hour": 20, "dur": 90, "players": [1]},
        ],
    },
]


async def _seed_extra_clubs(session, pw: str, now: datetime) -> int:
    """Seed the additional showcase clubs. Returns how many were created."""
    made = 0
    for spec in _EXTRA_CLUBS:
        club = Club(
            name=spec["name"],
            slug=spec["slug"],
            config={
                **DEFAULT_CONFIG,
                "sports": spec["sports"],
                "location": spec["location"],
                "tagline": spec["tagline"],
                "cover_image": spec["cover_image"],
                "showcase": True,
            },
        )
        session.add(club)
        await session.flush()

        first = spec["slug"].split("-")[0]
        members = []
        for i, (name, level) in enumerate(spec["members"]):
            handle = name.split()[0].lower()
            m = Member(
                club_id=club.id,
                name=name,
                email=f"{handle}@{spec['slug']}.club",
                hashed_password=pw,
                role=Role.ADMIN if i == 0 else Role.MEMBER,
                skill_level=level,
                tone="bg-primary/15 text-primary",
            )
            session.add(m)
            members.append(m)
        # A dedicated admin login (admin@<slug>.club) mirrors the live data.
        admin = Member(
            club_id=club.id,
            name=f"{spec['name']} Admin",
            email=f"admin@{spec['slug']}.club",
            hashed_password=pw,
            role=Role.ADMIN,
            skill_level="Advanced",
            tone="bg-primary/15 text-primary",
        )
        session.add(admin)
        await session.flush()

        courts = []
        for name, sport in spec["courts"]:
            c = Court(club_id=club.id, name=name, sport=sport, surface="", indoor=False)
            session.add(c)
            courts.append(c)
        await session.flush()

        for spec_match in spec["matches"]:
            start = _next_weekday(now, spec_match["day"], spec_match["hour"], 0)
            sport = spec_match["sport"]
            court = courts[spec_match["court"]]
            player_idxs = spec_match["players"]
            match = Match(
                club_id=club.id,
                court_id=court.id,
                host_member_id=members[player_idxs[0]].id,
                title=spec_match["title"],
                sport=sport,
                skill_level=spec_match["skill"],
                start_time=start,
                end_time=start + timedelta(minutes=spec_match["dur"]),
                duration_mins=spec_match["dur"],
                min_players=4 if sport == "padel" else 2,
                max_players=4 if sport == "padel" else 2,
                status=MatchStatus.OPEN,
            )
            for k, idx in enumerate(player_idxs):
                match.participants.append(
                    MatchParticipant(member_id=members[idx].id, role="host" if k == 0 else "player")
                )
            session.add(match)
        made += 1
    return made


async def seed_demo() -> None:
    async with SessionLocal() as session:
        existing = (
            await session.execute(select(Club).where(Club.slug == DEMO_SLUG))
        ).scalars().first()
        if existing is not None:
            return

        club = Club(
            name="AcePair Riverside",
            slug=DEMO_SLUG,
            config={
                **DEFAULT_CONFIG,
                "currency": "USD",
                "location": "Riverside",
                "tagline": "Where AcePair started — padel & tennis under the sun.",
                "cover_image": "/images/hero-court.jpg",
                "showcase": True,
            },
        )
        session.add(club)
        await session.flush()

        people = [
            ("Alex Rivera", "alex@riverside.club", Role.ADMIN, "Advanced", "bg-primary/15 text-primary"),
            ("Maya Okafor", "maya@riverside.club", Role.MEMBER, "Intermediate", "bg-primary/15 text-primary"),
            ("Léo Marchand", "leo@riverside.club", Role.MEMBER, "Advanced", "bg-accent/20 text-accent"),
            ("Sofia Ricci", "sofia@riverside.club", Role.MEMBER, "Improver", "bg-primary/15 text-primary"),
            ("Dan Whitlock", "dan@riverside.club", Role.MEMBER, "Intermediate", "bg-accent/20 text-accent"),
            ("Amara Sen", "amara@riverside.club", Role.MEMBER, "Advanced", "bg-primary/15 text-primary"),
            ("Tom Brenner", "tom@riverside.club", Role.MEMBER, "Improver", "bg-accent/20 text-accent"),
        ]
        members: dict = {}
        demo_password = settings.seed_demo_password or secrets.token_urlsafe(9)
        pw = hash_password(demo_password)
        for name, email, role, level, tone in people:
            m = Member(
                club_id=club.id,
                name=name,
                email=email,
                hashed_password=pw,
                role=role,
                skill_level=level,
                tone=tone,
            )
            session.add(m)
            members[name] = m
        await session.flush()

        courts_spec = [
            ("Court 1", "tennis", "Clay · Outdoor", False, "/images/court-clay.jpg"),
            ("Court 2", "padel", "Glass · Outdoor", False, "/images/court-padel.jpg"),
            ("Court 3", "padel", "Glass · Outdoor", False, "/images/court-padel.jpg"),
            ("Court 4", "tennis", "Hard · Outdoor", False, None),
            ("Court 5", "padel", "Panoramic · Indoor", True, "/images/hero-court.jpg"),
        ]
        courts: dict = {}
        for name, sport, surface, indoor, image in courts_spec:
            c = Court(
                club_id=club.id,
                name=name,
                sport=sport,
                surface=surface,
                indoor=indoor,
                image_url=image,
            )
            session.add(c)
            courts[name] = c
        await session.flush()

        now = datetime.now(timezone.utc)
        # A few open matches so the Discover feed has life on first load.
        match_specs = [
            {
                "title": "Golden-hour doubles",
                "sport": "padel",
                "court": "Court 3",
                "skill": "Intermediate",
                "start": _next_weekday(now, now.weekday(), 18, 30) if now.hour < 18 else now + timedelta(days=1, hours=2),
                "duration": 90,
                "min": 4,
                "max": 4,
                "host": "Maya Okafor",
                "players": ["Maya Okafor", "Dan Whitlock", "Tom Brenner"],
            },
            {
                "title": "Singles ladder — clay",
                "sport": "tennis",
                "court": "Court 1",
                "skill": "Advanced",
                "start": _next_weekday(now, 5, 8, 0),  # Saturday 8am
                "duration": 60,
                "min": 2,
                "max": 2,
                "host": "Léo Marchand",
                "players": ["Léo Marchand"],
            },
            {
                "title": "Friendly mixed pairs",
                "sport": "padel",
                "court": "Court 5",
                "skill": "Improver",
                "start": _next_weekday(now, 5, 11, 0),  # Saturday 11am
                "duration": 90,
                "min": 4,
                "max": 4,
                "host": "Sofia Ricci",
                "players": ["Sofia Ricci", "Amara Sen"],
            },
        ]
        for spec in match_specs:
            start = spec["start"]
            match = Match(
                club_id=club.id,
                court_id=courts[spec["court"]].id,
                host_member_id=members[spec["host"]].id,
                title=spec["title"],
                sport=spec["sport"],
                skill_level=spec["skill"],
                start_time=start,
                end_time=start + timedelta(minutes=spec["duration"]),
                duration_mins=spec["duration"],
                min_players=spec["min"],
                max_players=spec["max"],
                status=MatchStatus.OPEN,
            )
            for i, pname in enumerate(spec["players"]):
                match.participants.append(
                    MatchParticipant(
                        member_id=members[pname].id,
                        role="host" if pname == spec["host"] else "player",
                    )
                )
            session.add(match)

        extra = await _seed_extra_clubs(session, pw, now)
        await session.commit()
        logger.info(
            "seeded demo club '%s' with %d courts and %d members, plus %d showcase clubs",
            DEMO_SLUG, len(courts), len(members), extra,
        )
