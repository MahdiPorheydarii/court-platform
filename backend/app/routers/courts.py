"""Court configuration & listing."""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_auth_context, get_db, require_admin
from ..errors import NotFoundError
from ..models import Court
from ..schemas import CourtCreate, CourtOut, CourtUpdate

router = APIRouter(prefix="/v1", tags=["courts"])


async def _get_owned_court(session: AsyncSession, club_id: uuid.UUID, court_id: uuid.UUID) -> Court:
    court = await session.get(Court, court_id)
    if court is None or court.club_id != club_id:
        raise NotFoundError("Court not found.")
    return court


@router.get("/courts", response_model=List[CourtOut], summary="List the club's courts")
async def list_courts(
    include_inactive: bool = Query(False),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[CourtOut]:
    stmt = select(Court).where(Court.club_id == ctx.club.id)
    if not include_inactive:
        stmt = stmt.where(Court.is_active.is_(True))
    rows = await session.execute(stmt.order_by(Court.sport, Court.name))
    return [CourtOut.model_validate(c) for c in rows.scalars().all()]


@router.post(
    "/courts",
    response_model=CourtOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a court (admin)",
)
async def create_court(
    payload: CourtCreate,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> CourtOut:
    court = Court(
        club_id=ctx.club.id,
        name=payload.name,
        sport=payload.sport,
        surface=payload.surface,
        indoor=payload.indoor,
        image_url=payload.image_url,
    )
    session.add(court)
    await session.commit()
    await session.refresh(court)
    return CourtOut.model_validate(court)


@router.patch("/courts/{court_id}", response_model=CourtOut, summary="Update a court (admin)")
async def update_court(
    court_id: uuid.UUID,
    payload: CourtUpdate,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> CourtOut:
    court = await _get_owned_court(session, ctx.club.id, court_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(court, field, value)
    await session.commit()
    await session.refresh(court)
    return CourtOut.model_validate(court)


@router.delete(
    "/courts/{court_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retire a court (admin, soft-delete)",
)
async def delete_court(
    court_id: uuid.UUID,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    court = await _get_owned_court(session, ctx.club.id, court_id)
    court.is_active = False  # soft-delete keeps historical bookings intact
    await session.commit()
    return None
