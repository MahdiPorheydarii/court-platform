"""Club profile & configuration (admin-managed, data-driven)."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..deps import AuthContext, get_auth_context, get_club_by_slug, get_db, require_admin
from ..domain.config import ClubConfig, merge_config
from ..errors import NotFoundError
from ..models import Club, Court, Match, MatchStatus
from ..schemas import ClubConfigUpdate, ClubOut

router = APIRouter(prefix="/v1", tags=["clubs"])


@router.get(
    "/public/clubs",
    tags=["public"],
    summary="Public club directory for the landing showcase (no auth)",
)
async def public_clubs(session: AsyncSession = Depends(get_db)) -> List[Dict[str, Any]]:
    """Clubs that opted into the public showcase (``config.showcase == true``).

    Test/tenant clubs without the flag are never listed. Court and open-match
    counts come from two grouped queries, so this stays a handful of round-trips
    regardless of how many clubs exist.
    """
    clubs = (await session.execute(select(Club))).scalars().all()
    showcased = [c for c in clubs if (c.config or {}).get("showcase")]
    if not showcased:
        return []
    ids = [c.id for c in showcased]

    court_rows = (
        await session.execute(
            select(Court.club_id, func.count())
            .where(Court.club_id.in_(ids), Court.is_active.is_(True))
            .group_by(Court.club_id)
        )
    ).all()
    courts_by = {cid: n for cid, n in court_rows}
    match_rows = (
        await session.execute(
            select(Match.club_id, func.count())
            .where(Match.club_id.in_(ids), Match.status == MatchStatus.OPEN)
            .group_by(Match.club_id)
        )
    ).all()
    matches_by = {cid: n for cid, n in match_rows}

    out: List[Dict[str, Any]] = []
    for c in showcased:
        cfg = c.config or {}
        out.append(
            {
                "name": c.name,
                "slug": c.slug,
                "sports": ClubConfig(cfg).sports,
                "location": cfg.get("location"),
                "tagline": cfg.get("tagline"),
                "cover_image": cfg.get("cover_image"),
                "courts": courts_by.get(c.id, 0),
                "open_matches": matches_by.get(c.id, 0),
            }
        )
    # Liveliest clubs first, then alphabetical.
    out.sort(key=lambda x: (-x["open_matches"], x["name"]))
    return out


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
    raw = club.config or {}
    return {
        "name": club.name,
        "slug": club.slug,
        "sports": cfg.sports,
        "location": raw.get("location"),
        "tagline": raw.get("tagline"),
        "cover_image": raw.get("cover_image"),
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
