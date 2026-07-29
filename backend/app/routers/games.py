"""Aggregated "my games" view: matches I'm in + courts I've booked."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..deps import AuthContext, get_auth_context, get_db
from ..models import (
    Booking,
    BookingSource,
    BookingStatus,
    LedgerEntry,
    Match,
    MatchParticipant,
    MatchStatus,
    Member,
)
from ..schemas import GameOut, PlayerOut
from ..services.serializers import initials_of, serialize_match

router = APIRouter(prefix="/v1", tags=["games"])


@router.get("/me/games", response_model=List[GameOut], summary="My upcoming or past games")
async def my_games(
    when: str = Query("upcoming", pattern="^(upcoming|past)$"),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[GameOut]:
    now = datetime.now(timezone.utc)
    me = ctx.member.id
    games: List[GameOut] = []

    # --- Matches I'm a participant in ---
    match_ids = (
        select(MatchParticipant.match_id)
        .where(MatchParticipant.member_id == me)
        .scalar_subquery()
    )
    matches = (
        await session.execute(
            select(Match)
            .options(selectinload(Match.participants))
            .where(Match.club_id == ctx.club.id, Match.id.in_(match_ids))
        )
    ).scalars().all()
    for m in matches:
        mo = await serialize_match(session, m)
        status = (
            "confirmed"
            if m.status == MatchStatus.CONFIRMED
            else "filling"
            if m.status == MatchStatus.OPEN
            else m.status
        )
        games.append(
            GameOut(
                id=m.id,
                kind="match",
                role="host" if m.host_member_id == me else "joined",
                sport=m.sport,
                title=m.title,
                club_name=mo.club_name,
                court_name=mo.court_name,
                start_time=m.start_time,
                end_time=m.end_time,
                duration_mins=m.duration_mins,
                status=status,
                spots_total=mo.spots_total,
                spots_filled=mo.spots_filled,
                price_per_person_cents=mo.price_per_person_cents,
                price_per_person=mo.price_per_person,
                players=mo.players,
                match_id=m.id,
                booking_id=m.booking_id,
            )
        )

    # --- Direct court bookings I host (match bookings are covered above) ---
    bookings = (
        await session.execute(
            select(Booking).where(
                Booking.club_id == ctx.club.id,
                Booking.host_member_id == me,
                Booking.source == BookingSource.DIRECT,
            )
        )
    ).scalars().all()
    for b in bookings:
        ledger = (
            await session.execute(
                select(LedgerEntry).where(LedgerEntry.booking_id == b.id)
            )
        ).scalars().all()
        member_ids = [e.member_id for e in ledger]
        members = {}
        if member_ids:
            rows = await session.execute(select(Member).where(Member.id.in_(member_ids)))
            members = {mm.id: mm for mm in rows.scalars().all()}
        players = [
            PlayerOut(
                id=mm.id,
                name=mm.name,
                initials=initials_of(mm.name),
                level=mm.skill_level,
                tone=mm.tone,
            )
            for mid, mm in members.items()
        ]
        per_person_cents = min((e.amount_cents for e in ledger), default=b.total_fee_cents)
        court = None
        # court name/ sport via serializer-lite
        from ..models import Court  # local import to avoid cycle at module load

        court = await session.get(Court, b.court_id)
        games.append(
            GameOut(
                id=b.id,
                kind="court",
                role="booked",
                sport=court.sport if court else "",
                title=b.title,
                club_name=ctx.club.name,
                court_name=court.name if court else None,
                start_time=b.start_time,
                end_time=b.end_time,
                duration_mins=int((b.end_time - b.start_time).total_seconds() // 60),
                status="cancelled" if b.status == BookingStatus.CANCELLED else "confirmed",
                spots_total=max(len(players), 1),
                spots_filled=len(players),
                price_per_person_cents=per_person_cents,
                price_per_person=round(per_person_cents / 100, 2),
                players=players,
                booking_id=b.id,
            )
        )

    # --- Filter by time window ---
    def is_upcoming(g: GameOut) -> bool:
        return g.start_time >= now and g.status not in ("cancelled", "expired")

    if when == "upcoming":
        games = [g for g in games if is_upcoming(g)]
        games.sort(key=lambda g: g.start_time)
    else:
        games = [g for g in games if not is_upcoming(g)]
        games.sort(key=lambda g: g.start_time, reverse=True)
    return games
