"""Recurring court reservations — admin-managed weekly holds."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_db, require_admin
from ..errors import NotFoundError
from ..models import Booking, BookingStatus, Court, RecurringReservation
from ..schemas import ReservationCreate, ReservationCreateResult, ReservationOut
from ..services import reservations as rsvc

router = APIRouter(prefix="/v1", tags=["reservations"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _serialize(
    session: AsyncSession, rr: RecurringReservation, court_name: str, now: datetime
) -> ReservationOut:
    upcoming = (
        await session.execute(
            select(func.count()).select_from(Booking).where(
                Booking.recurring_id == rr.id,
                Booking.start_time > now,
                Booking.status != BookingStatus.CANCELLED,
            )
        )
    ).scalar_one()
    hh, mm = divmod(rr.start_minute, 60)
    return ReservationOut(
        id=rr.id,
        court_id=rr.court_id,
        court_name=court_name,
        title=rr.title,
        weekday=rr.weekday,
        start_time=f"{hh:02d}:{mm:02d}",
        duration_mins=rr.duration_mins,
        active=rr.active,
        upcoming=upcoming,
    )


@router.get("/reservations", response_model=List[ReservationOut], summary="Recurring court holds (admin)")
async def list_reservations(
    ctx: AuthContext = Depends(require_admin), session: AsyncSession = Depends(get_db)
) -> List[ReservationOut]:
    rows = (
        await session.execute(
            select(RecurringReservation, Court.name)
            .join(Court, Court.id == RecurringReservation.court_id)
            .where(RecurringReservation.club_id == ctx.club.id, RecurringReservation.active.is_(True))
            .order_by(RecurringReservation.weekday, RecurringReservation.start_minute)
        )
    ).all()
    now = _now()
    return [await _serialize(session, rr, name, now) for rr, name in rows]


@router.post(
    "/reservations",
    response_model=ReservationCreateResult,
    status_code=status.HTTP_201_CREATED,
    summary="Create a recurring court hold (admin)",
)
async def create_reservation(
    payload: ReservationCreate,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> ReservationCreateResult:
    court = await session.get(Court, payload.court_id)
    if court is None or court.club_id != ctx.club.id:
        raise NotFoundError("Court not found.")
    hh, mm = payload.start_time.split(":")
    start_minute = int(hh) * 60 + int(mm)
    now = _now()
    rr, created, skipped = await rsvc.create_recurring(
        session,
        club=ctx.club,
        admin=ctx.member,
        court_id=payload.court_id,
        title=payload.title,
        weekday=payload.weekday,
        start_minute=start_minute,
        duration_mins=payload.duration_mins,
        weeks=payload.weeks,
        now=now,
    )
    await session.commit()
    out = await _serialize(session, rr, court.name, now)
    return ReservationCreateResult(reservation=out, created=created, skipped=skipped)


@router.delete("/reservations/{reservation_id}", summary="Cancel a recurring hold + its future bookings (admin)")
async def delete_reservation(
    reservation_id: uuid.UUID,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    rr = await session.get(RecurringReservation, reservation_id)
    if rr is None or rr.club_id != ctx.club.id:
        raise NotFoundError("Reservation not found.")
    cancelled = await rsvc.cancel_recurring(session, rr=rr, now=_now())
    await session.commit()
    return {"cancelled_bookings": cancelled}
