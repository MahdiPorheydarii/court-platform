"""Club profile & configuration (admin-managed, data-driven)."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..deps import AuthContext, get_auth_context, get_club_by_slug, get_db, require_admin
from ..domain.config import ClubConfig, merge_config
from ..errors import NotFoundError
from ..models import Court, Match, MatchStatus
from ..schemas import ClubConfigUpdate, ClubOut

router = APIRouter(prefix="/v1", tags=["clubs"])


@router.get(
    "/public/clubs/{slug}",
    tags=["public"],
    summary="Public club info for a club landing page (no auth)",
)
async def public_club(slug: str, session: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    club = await get_club_by_slug(session, slug)
    if club is None:
        raise NotFoundError("No club found at that address.")
    cfg = ClubConfig(club.config)
    courts = (
        await session.execute(
            select(func.count()).select_from(Court).where(
                Court.club_id == club.id, Court.is_active.is_(True)
            )
        )
    ).scalar_one()
    open_matches = (
        await session.execute(
            select(func.count()).select_from(Match).where(
                Match.club_id == club.id, Match.status == MatchStatus.OPEN
            )
        )
    ).scalar_one()
    return {
        "name": club.name,
        "slug": club.slug,
        "sports": cfg.sports,
        "courts": courts,
        "open_matches": open_matches,
    }


@router.get("/club", response_model=ClubOut, summary="Current club")
async def get_club(ctx: AuthContext = Depends(get_auth_context)) -> ClubOut:
    return ClubOut.model_validate(ctx.club)


@router.get("/club/config", summary="Effective club config (with defaults applied)")
async def get_config(ctx: AuthContext = Depends(get_auth_context)) -> Dict[str, Any]:
    return ClubConfig(ctx.club.config).to_dict()


@router.patch("/club/config", response_model=ClubOut, summary="Update club config (admin)")
async def update_config(
    payload: ClubConfigUpdate,
    ctx: AuthContext = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> ClubOut:
    club = ctx.club
    club.config = merge_config(club.config, payload.config)
    flag_modified(club, "config")  # JSONB dicts need an explicit dirty flag
    await session.commit()
    await session.refresh(club)
    return ClubOut.model_validate(club)
