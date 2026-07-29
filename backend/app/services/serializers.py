"""Turn ORM rows into API response models, resolving related names/players.

Kept in one place so every endpoint returns a consistent shape and we avoid
N+1 lazy-loads (which async SQLAlchemy forbids anyway).
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain import fees as fee_logic
from ..domain.config import ClubConfig
from ..models import Booking, Club, Court, Match, Member
from ..schemas import BookingOut, LedgerEntryOut, MatchOut, PlayerOut
from .booking import get_ledger


def initials_of(name: str) -> str:
    parts = name.split()
    return ("".join(p[0] for p in parts[:2]).upper()) if parts else "?"


def player_out(member: Member) -> PlayerOut:
    return PlayerOut(
        id=member.id,
        name=member.name,
        initials=initials_of(member.name),
        level=member.skill_level,
        tone=member.tone,
    )


async def _members_by_id(
    session: AsyncSession, ids: List[uuid.UUID]
) -> Dict[uuid.UUID, Member]:
    if not ids:
        return {}
    rows = await session.execute(select(Member).where(Member.id.in_(ids)))
    return {m.id: m for m in rows.scalars().all()}


async def serialize_match(session: AsyncSession, match: Match) -> MatchOut:
    club = await session.get(Club, match.club_id)
    court = await session.get(Court, match.court_id) if match.court_id else None

    participants = sorted(match.participants, key=lambda p: p.joined_at)
    member_ids = [p.member_id for p in participants]
    members = await _members_by_id(session, member_ids)
    players = [player_out(members[mid]) for mid in member_ids if mid in members]

    host_name: Optional[str] = None
    if match.host_member_id and match.host_member_id in members:
        host_name = members[match.host_member_id].name
    elif players:
        host_name = players[0].name

    spots_total = match.max_players
    spots_filled = len(participants)
    # Confirmed matches carry the real split; for an open match show the expected
    # per-person price *if it fills* (fee split across max players) rather than $0.
    ppc = match.price_per_person_cents
    if ppc is None and club is not None:
        cfg = ClubConfig(club.config)
        peak = fee_logic.is_peak(match.start_time, cfg.peak_windows)
        sport_fee = cfg.fee_for(match.sport)
        base_rate = (court.hourly_rate_cents if court else None) or sport_fee.base_rate_per_hour_cents
        total = fee_logic.compute_total_fee_cents(
            base_rate, match.duration_mins, sport_fee.peak_multiplier, peak
        )
        ppc = -(-total // max(1, match.max_players))  # ceil at a full split

    return MatchOut(
        id=match.id,
        sport=match.sport,
        title=match.title,
        club_name=club.name if club else "",
        court_name=court.name if court else None,
        skill_level=match.skill_level,
        start_time=match.start_time,
        end_time=match.end_time,
        duration_mins=match.duration_mins,
        status=match.status,
        min_players=match.min_players,
        max_players=match.max_players,
        spots_total=spots_total,
        spots_filled=spots_filled,
        spots_left=max(0, spots_total - spots_filled),
        price_per_person_cents=ppc,
        price_per_person=round(ppc / 100, 2) if ppc is not None else None,
        host_name=host_name,
        players=players,
        booking_id=match.booking_id,
        created_at=match.created_at,
    )


async def serialize_booking(
    session: AsyncSession, booking: Booking, *, include_ledger: bool = True
) -> BookingOut:
    club = await session.get(Club, booking.club_id)
    court = await session.get(Court, booking.court_id)
    duration = int((booking.end_time - booking.start_time).total_seconds() // 60)

    # The "per person" quote is the fair share (total split N ways), ceiled so
    # it never under-states an individual's actual ledger amount. The ledger
    # itself is the authoritative, penny-accurate record of who owes what.
    split_count = max(1, booking.split_count or 1)
    per_person_cents = -(-booking.total_fee_cents // split_count)

    ledger_out: List[LedgerEntryOut] = []
    if include_ledger:
        entries = await get_ledger(session, booking.id)
        for e in entries:
            ledger_out.append(
                LedgerEntryOut(
                    id=e.id,
                    member_id=e.member_id,
                    amount_cents=e.amount_cents,
                    amount=round(e.amount_cents / 100, 2),
                    currency=e.currency,
                    status=e.status,
                    description=e.description,
                    created_at=e.created_at,
                )
            )

    return BookingOut(
        id=booking.id,
        court_id=booking.court_id,
        court_name=court.name if court else "",
        club_name=club.name if club else "",
        sport=court.sport if court else "",
        title=booking.title,
        start_time=booking.start_time,
        end_time=booking.end_time,
        duration_mins=duration,
        status=booking.status,
        source=booking.source,
        is_peak=booking.is_peak,
        total_fee_cents=booking.total_fee_cents,
        total_fee=round(booking.total_fee_cents / 100, 2),
        currency=booking.currency,
        per_person_cents=per_person_cents,
        per_person=round(per_person_cents / 100, 2),
        match_id=booking.match_id,
        ledger=ledger_out,
    )
