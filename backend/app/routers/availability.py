"""Court availability — synthesised bookable slots with live free/taken status."""
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, time, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_auth_context, get_db
from ..domain import fees as fee_logic
from ..domain.config import ClubConfig
from ..models import Booking, BookingStatus, Court
from ..schemas import AvailabilitySlot

router = APIRouter(prefix="/v1", tags=["availability"])


def _parse_hhmm(value: str) -> time:
    hh, mm = value.split(":")
    return time(int(hh), int(mm))


@router.get("/availability", response_model=List[AvailabilitySlot], summary="Bookable slots")
async def availability(
    sport: Optional[str] = Query(None, examples=["padel"]),
    date: Optional[date_cls] = Query(None, description="First day (defaults to today)"),
    days: int = Query(1, ge=1, le=7),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[AvailabilitySlot]:
    cfg = ClubConfig(ctx.club.config)
    hours = cfg.operating_hours
    open_t = _parse_hhmm(hours.get("start", "08:00"))
    close_t = _parse_hhmm(hours.get("end", "22:00"))
    start_day = date or datetime.now(timezone.utc).date()

    # Courts in scope.
    stmt = select(Court).where(Court.club_id == ctx.club.id, Court.is_active.is_(True))
    if sport:
        stmt = stmt.where(Court.sport == sport)
    courts = list((await session.execute(stmt.order_by(Court.sport, Court.name))).scalars().all())
    if not courts:
        return []

    range_start = datetime.combine(start_day, open_t, tzinfo=timezone.utc)
    range_end = datetime.combine(start_day + timedelta(days=days - 1), close_t, tzinfo=timezone.utc)

    # Existing bookings across the whole window, grouped per court.
    booked_rows = (
        await session.execute(
            select(Booking).where(
                Booking.club_id == ctx.club.id,
                Booking.status != BookingStatus.CANCELLED,
                Booking.start_time < range_end,
                Booking.end_time > range_start,
            )
        )
    ).scalars().all()
    taken: dict = {}
    for b in booked_rows:
        taken.setdefault(b.court_id, []).append((b.start_time, b.end_time))

    slots: List[AvailabilitySlot] = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        for court in courts:
            duration = cfg.slot_minutes(court.sport)
            sport_fee = cfg.fee_for(court.sport)
            cursor = datetime.combine(day, open_t, tzinfo=timezone.utc)
            day_end = datetime.combine(day, close_t, tzinfo=timezone.utc)
            while cursor + timedelta(minutes=duration) <= day_end:
                slot_end = cursor + timedelta(minutes=duration)
                is_free = not any(
                    s < slot_end and e > cursor for (s, e) in taken.get(court.id, [])
                )
                peak = fee_logic.is_peak(cursor, cfg.peak_windows)
                base_rate = court.hourly_rate_cents or sport_fee.base_rate_per_hour_cents
                price_cents = fee_logic.compute_total_fee_cents(
                    base_rate, duration, sport_fee.peak_multiplier, peak
                )
                slots.append(
                    AvailabilitySlot(
                        court_id=court.id,
                        court_name=court.name,
                        sport=court.sport,
                        surface=court.surface,
                        indoor=court.indoor,
                        image_url=court.image_url,
                        start_time=cursor,
                        end_time=slot_end,
                        duration_mins=duration,
                        is_peak=peak,
                        price_cents=price_cents,
                        price=round(price_cents / 100, 2),
                        available=is_free,
                    )
                )
                cursor = slot_end
    return slots
