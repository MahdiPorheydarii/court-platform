"""Court bookings: create (concurrency-safe), list, inspect fees, cancel."""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_auth_context, get_db
from ..errors import NotFoundError
from ..models import Booking, BookingStatus, LedgerEntry, Member
from ..schemas import BookingCreate, BookingOut
from ..services import booking as booking_service
from ..services.notifications import notify, notify_many
from ..services.serializers import serialize_booking

router = APIRouter(prefix="/v1", tags=["bookings"])


async def _club_member_ids(session: AsyncSession, club_id, ids: list) -> list:
    """Keep only ids that are members of this club — never let a booking write
    ledger or notification rows against another tenant's members."""
    if not ids:
        return []
    rows = await session.execute(
        select(Member.id).where(Member.club_id == club_id, Member.id.in_(ids))
    )
    valid = {r[0] for r in rows.all()}
    return [i for i in ids if i in valid]


async def _get_owned_booking(session: AsyncSession, ctx: AuthContext, booking_id: uuid.UUID) -> Booking:
    b = await session.get(Booking, booking_id)
    if b is None or b.club_id != ctx.club.id:
        raise NotFoundError("Booking not found.")
    # A member sees their own booking or one they're splitting; admins see all.
    if ctx.member.role != "admin" and b.host_member_id != ctx.member.id:
        has_share = (
            await session.execute(
                select(LedgerEntry.id).where(
                    LedgerEntry.booking_id == b.id,
                    LedgerEntry.member_id == ctx.member.id,
                )
            )
        ).first()
        if has_share is None:
            raise NotFoundError("Booking not found.")
    return b


@router.post(
    "/bookings",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Book a court slot (safe under concurrent attempts)",
)
async def create_booking(
    payload: BookingCreate,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> BookingOut:
    invitees = await _club_member_ids(session, ctx.club.id, payload.invite_member_ids)
    booking = await booking_service.create_booking(
        session,
        club=ctx.club,
        host=ctx.member,
        court_id=payload.court_id,
        start_time=payload.start_time,
        duration_mins=payload.duration_mins,
        title=payload.title,
        split_count=payload.split_count,
        invitee_ids=invitees,
    )
    await notify(
        session,
        club_id=ctx.club.id,
        member_id=ctx.member.id,
        type="booking_confirmed",
        title="Court booked",
        body=f"{booking.title} is confirmed.",
        data={"booking_id": str(booking.id)},
    )
    if invitees:
        await notify_many(
            session,
            club_id=ctx.club.id,
            member_ids=[m for m in invitees if m != ctx.member.id],
            type="booking_invite",
            title=f"{ctx.member.name} invited you to split a court",
            body=f"You're in for {booking.title}.",
            data={"booking_id": str(booking.id)},
        )
    await session.commit()
    return await serialize_booking(session, booking)


@router.get("/bookings", response_model=List[BookingOut], summary="List bookings")
async def list_bookings(
    scope: str = Query("mine", pattern="^(mine|club)$"),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[BookingOut]:
    stmt = select(Booking).where(Booking.club_id == ctx.club.id)
    if scope == "club":
        if ctx.member.role != "admin":
            scope = "mine"
    if scope == "mine":
        # Bookings I host, or ones where I hold a fee share.
        mine = (
            select(LedgerEntry.booking_id)
            .where(LedgerEntry.member_id == ctx.member.id)
            .scalar_subquery()
        )
        stmt = stmt.where(
            or_(Booking.host_member_id == ctx.member.id, Booking.id.in_(mine))
        )
    rows = await session.execute(stmt.order_by(Booking.start_time.desc()))
    return [await serialize_booking(session, b) for b in rows.scalars().all()]


@router.get("/bookings/{booking_id}", response_model=BookingOut, summary="Booking detail")
async def get_booking(
    booking_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> BookingOut:
    booking = await _get_owned_booking(session, ctx, booking_id)
    return await serialize_booking(session, booking)


@router.get("/bookings/{booking_id}/fees", summary="Auditable fee split for a booking")
async def booking_fees(
    booking_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    booking = await _get_owned_booking(session, ctx, booking_id)
    out = await serialize_booking(session, booking)
    return {
        "booking_id": str(out.id),
        "total_fee_cents": out.total_fee_cents,
        "total_fee": out.total_fee,
        "currency": out.currency,
        "is_peak": out.is_peak,
        "entries": [e.model_dump(mode="json") for e in out.ledger],
    }


@router.delete("/bookings/{booking_id}", summary="Cancel a booking")
async def cancel_booking(
    booking_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    booking = await session.get(Booking, booking_id)
    if booking is None or booking.club_id != ctx.club.id:
        raise NotFoundError("Booking not found.")
    result = await booking_service.cancel_booking(
        session, club=ctx.club, booking=booking, actor=ctx.member
    )
    await notify(
        session,
        club_id=ctx.club.id,
        member_id=booking.host_member_id or ctx.member.id,
        type="booking_cancelled",
        title="Booking cancelled",
        body=(
            "Your booking was cancelled and the charge waived."
            if result["charge_waived"]
            else "Your booking was cancelled inside the cancellation window; the charge stands."
        ),
        data={"booking_id": str(booking.id)},
    )
    await session.commit()
    return result
