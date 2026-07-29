"""Recurring court reservations (admin holds).

A recurring reservation is a weekly rule ("Court 1, Tuesdays 18:00, 90 min").
Creating one materialises a horizon of ``hold`` bookings — free, unbilled, but
still enforced by the no-double-booking constraint. Deleting it cancels the
future bookings in the series.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import ConflictError
from ..models import Booking, BookingSource, BookingStatus, Club, Member, RecurringReservation
from . import booking as booking_service

# How many weeks ahead a new recurring reservation is materialised.
HORIZON_WEEKS = 12


def _occurrences(weekday: int, start_minute: int, weeks: int, now: datetime) -> List[datetime]:
    """The next ``weeks`` future start times matching ``weekday`` at ``start_minute`` (UTC)."""
    days_ahead = (weekday - now.weekday()) % 7
    first_date = (now + timedelta(days=days_ahead)).date()
    out: List[datetime] = []
    for i in range(weeks + 1):  # +1 so a just-passed slot today still yields `weeks` future ones
        start = datetime.combine(first_date + timedelta(weeks=i), time(0, 0), tzinfo=timezone.utc) + timedelta(
            minutes=start_minute
        )
        if start > now:
            out.append(start)
    return out[:weeks]


async def create_recurring(
    session: AsyncSession,
    *,
    club: Club,
    admin: Member,
    court_id: uuid.UUID,
    title: str,
    weekday: int,
    start_minute: int,
    duration_mins: int,
    weeks: int,
    now: datetime,
) -> Tuple[RecurringReservation, int, int]:
    rr = RecurringReservation(
        club_id=club.id,
        court_id=court_id,
        title=title,
        weekday=weekday,
        start_minute=start_minute,
        duration_mins=duration_mins,
        active=True,
    )
    session.add(rr)
    await session.flush()

    created = skipped = 0
    for start in _occurrences(weekday, start_minute, weeks, now):
        try:
            await booking_service.create_booking(
                session,
                club=club,
                host=admin,
                court_id=court_id,
                start_time=start,
                duration_mins=duration_mins,
                title=title,
                split_count=1,
                source=BookingSource.HOLD,
                recurring_id=rr.id,
                free=True,
            )
            created += 1
        except ConflictError:
            skipped += 1  # slot already taken — skip, keep the rest of the series
    return rr, created, skipped


async def cancel_recurring(
    session: AsyncSession, *, rr: RecurringReservation, now: datetime
) -> int:
    """Deactivate the rule and cancel its future (not-yet-played) hold bookings."""
    rr.active = False
    rows = (
        await session.execute(
            select(Booking).where(
                Booking.recurring_id == rr.id,
                Booking.start_time > now,
                Booking.status != BookingStatus.CANCELLED,
            )
        )
    ).scalars().all()
    for b in rows:
        b.status = BookingStatus.CANCELLED
        b.cancelled_at = now
    return len(rows)
