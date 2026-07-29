"""Booking service — the one place that needs hard consistency.

``create_booking`` inserts a row guarded by the GiST exclusion constraint
``no_overlapping_bookings``. If two requests race for the same court+slot, the
database lets exactly one commit; the loser's INSERT raises an exclusion
violation which we translate into a clean 409. No application-level lock is
involved, so there is no window where two winners can slip through.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain import fees as fee_logic
from ..domain.config import ClubConfig
from ..errors import ConflictError, ForbiddenError, NotFoundError
from ..models import (
    Booking,
    BookingSource,
    BookingStatus,
    Club,
    Court,
    LedgerEntry,
    LedgerStatus,
    Member,
)

# Postgres SQLSTATE for exclusion_violation.
_EXCLUSION_VIOLATION = "23P01"


def _is_exclusion_violation(err: IntegrityError) -> bool:
    orig = getattr(err, "orig", None)
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    if sqlstate == _EXCLUSION_VIOLATION:
        return True
    return "no_overlapping_bookings" in str(orig)


async def _get_court(session: AsyncSession, club_id: uuid.UUID, court_id: uuid.UUID) -> Court:
    court = await session.get(Court, court_id)
    if court is None or court.club_id != club_id:
        raise NotFoundError("Court not found.")
    if not court.is_active:
        raise ForbiddenError("That court is not currently bookable.")
    return court


def _build_ledger_rows(
    total_cents: int,
    split_count: int,
    host_id: uuid.UUID,
    invitee_ids: Sequence[uuid.UUID],
    absorb_unclaimed: bool = False,
) -> List[Tuple[uuid.UUID, int]]:
    """Assign the fee across the split.

    Known people (host first, then invitees) each take a share. What happens to
    shares nobody has claimed depends on ``absorb_unclaimed``:

    * ``False`` (default): unclaimed shares fall to the host, who is on the hook
      until a friend accepts — so the ledger reconciles to the full total.
    * ``True`` (club-absorbs policy): unclaimed shares are simply not billed;
      the club eats the empty seats and the ledger sums to less than the total.
    """
    split_count = max(1, split_count)
    members: List[uuid.UUID] = [host_id]
    for mid in invitee_ids:
        if mid != host_id and mid not in members and len(members) < split_count:
            members.append(mid)

    shares = fee_logic.split_evenly(total_cents, split_count)
    rows: List[Tuple[uuid.UUID, int]] = []
    host_amount = shares[0]
    if not absorb_unclaimed:
        # Unclaimed shares (beyond the known members) fall to the host.
        for i in range(len(members), split_count):
            host_amount += shares[i]
    rows.append((host_id, host_amount))
    for idx in range(1, len(members)):
        rows.append((members[idx], shares[idx]))
    return rows


async def create_booking(
    session: AsyncSession,
    *,
    club: Club,
    host: Member,
    court_id: uuid.UUID,
    start_time: datetime,
    duration_mins: int,
    title: Optional[str] = None,
    split_count: Optional[int] = None,
    invitee_ids: Optional[Sequence[uuid.UUID]] = None,
    source: str = BookingSource.DIRECT,
    match_id: Optional[uuid.UUID] = None,
    recurring_id: Optional[uuid.UUID] = None,
    absorb_unclaimed: bool = False,
    free: bool = False,
) -> Booking:
    court = await _get_court(session, club.id, court_id)
    cfg = ClubConfig(club.config)

    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    end_time = start_time + timedelta(minutes=duration_mins)

    peak = fee_logic.is_peak(start_time, cfg.peak_windows)
    sport_fee = cfg.fee_for(court.sport)
    base_rate = court.hourly_rate_cents or sport_fee.base_rate_per_hour_cents
    # A hold (maintenance/coaching block) reserves the court but is not billed.
    total_cents = 0 if free else fee_logic.compute_total_fee_cents(
        base_rate, duration_mins, sport_fee.peak_multiplier, peak
    )

    if split_count is None:
        split_count = cfg.max_players(court.sport)

    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        host_member_id=host.id,
        match_id=match_id,
        recurring_id=recurring_id,
        title=title or f"{court.name} booking",
        start_time=start_time,
        end_time=end_time,
        status=BookingStatus.CONFIRMED,
        source=source,
        total_fee_cents=total_cents,
        split_count=split_count,
        currency=cfg.currency,
        is_peak=peak,
    )
    try:
        # A SAVEPOINT scopes the exclusion-constraint failure to just this
        # INSERT, so a conflict rolls back only the booking — not any work the
        # caller already did in the surrounding transaction (e.g. a match being
        # confirmed). The constraint is evaluated at flush, inside the savepoint.
        async with session.begin_nested():
            session.add(booking)
            await session.flush()
    except IntegrityError as exc:
        if _is_exclusion_violation(exc):
            raise ConflictError(
                "That court slot was just booked. Try another time.",
                details={"court_id": str(court_id), "start_time": start_time.isoformat()},
            )
        raise

    ledger_rows = [] if free else _build_ledger_rows(
        total_cents, split_count, host.id, list(invitee_ids or []), absorb_unclaimed
    )
    for member_id, amount in ledger_rows:
        session.add(
            LedgerEntry(
                club_id=club.id,
                booking_id=booking.id,
                match_id=match_id,
                member_id=member_id,
                amount_cents=amount,
                currency=cfg.currency,
                status=LedgerStatus.OWED,
                description=f"Court fee share — {court.name}",
            )
        )
    await session.flush()
    return booking


async def get_ledger(session: AsyncSession, booking_id: uuid.UUID) -> List[LedgerEntry]:
    rows = await session.execute(
        select(LedgerEntry)
        .where(LedgerEntry.booking_id == booking_id)
        .order_by(LedgerEntry.created_at)
    )
    return list(rows.scalars().all())


async def cancel_booking(
    session: AsyncSession, *, club: Club, booking: Booking, actor: Member
) -> dict:
    """Cancel a booking, freeing the slot, and resolve the fee split.

    Outside the cancellation window the charge is waived (ledger -> waived).
    Inside the window the slot is freed but the charge stands (ledger stays
    owed), per typical club policy.
    """
    if booking.status == BookingStatus.CANCELLED:
        raise ConflictError("This booking is already cancelled.")
    if actor.role != "admin" and booking.host_member_id != actor.id:
        raise ForbiddenError("You can only cancel your own bookings.")

    cfg = ClubConfig(club.config)
    now = datetime.now(timezone.utc)
    start = booking.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    window = timedelta(hours=cfg.cancellation_window_hours)
    within_window = now > (start - window)

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = now

    ledger = await get_ledger(session, booking.id)
    if not within_window:
        for entry in ledger:
            if entry.status == LedgerStatus.OWED:
                entry.status = LedgerStatus.WAIVED
    await session.flush()
    return {
        "cancelled": True,
        "charge_waived": not within_window,
        "within_cancellation_window": within_window,
    }
