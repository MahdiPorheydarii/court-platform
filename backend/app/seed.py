"""Idempotent demo seeding.

On first boot this creates a demo club ("AcePair Riverside") with courts,
members, and a few open matches so the deployed instance — and the frontend
pointed at it — feels alive immediately. Safe to run every boot: it no-ops if
the demo club already exists.

Demo login (documented in the README):
    club slug : riverside
    email     : alex@riverside.club
    password  : acepair123
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

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
DEMO_PASSWORD = "acepair123"


def _next_weekday(base: datetime, weekday: int, hour: int, minute: int = 0) -> datetime:
    days_ahead = (weekday - base.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    target = base + timedelta(days=days_ahead)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


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
            config={**DEFAULT_CONFIG, "currency": "USD"},
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
        pw = hash_password(DEMO_PASSWORD)
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
            ("Court 1", "tennis", "Clay · Outdoor", False, "/images/court-clay.png"),
            ("Court 2", "padel", "Glass · Outdoor", False, "/images/court-padel.png"),
            ("Court 3", "padel", "Glass · Outdoor", False, "/images/court-padel.png"),
            ("Court 4", "tennis", "Hard · Outdoor", False, None),
            ("Court 5", "padel", "Panoramic · Indoor", True, "/images/hero-court.png"),
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

        await session.commit()
        logger.info("seeded demo club '%s' with %d courts and %d members", DEMO_SLUG, len(courts), len(members))
