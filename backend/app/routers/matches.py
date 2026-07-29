"""Matchmaking API: post requests, host matches, discover, join, leave."""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..deps import AuthContext, get_auth_context, get_db
from ..errors import NotFoundError
from ..models import Match, MatchParticipant, MatchRequest, MatchStatus
from ..realtime import hub, match_update_payload
from ..schemas import (
    HostMatchCreate,
    MatchOut,
    MatchRequestCreate,
    MatchRequestOut,
    MatchRequestResult,
)
from ..services import matchmaking
from ..services.serializers import serialize_match

router = APIRouter(prefix="/v1", tags=["matchmaking"])


async def _broadcast(club_id, m: MatchOut) -> None:
    """Push a live match-fill update to everyone in the club."""
    try:
        await hub.broadcast_club(
            str(club_id),
            match_update_payload(str(m.id), m.spots_filled, m.spots_total, m.min_players, m.status),
        )
    except Exception:  # pragma: no cover - realtime is best-effort
        pass


async def _load_match(
    session: AsyncSession,
    club_id: uuid.UUID,
    match_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Match:
    stmt = (
        select(Match)
        .options(selectinload(Match.participants))
        .where(Match.id == match_id, Match.club_id == club_id)
    )
    if for_update:
        # Serialize concurrent joins/leaves on the match row so the capacity
        # check can't be raced past max_players.
        stmt = stmt.with_for_update(of=Match)
    row = await session.execute(stmt)
    match = row.scalars().first()
    if match is None:
        raise NotFoundError("Match not found.")
    return match


@router.post(
    "/match-requests",
    response_model=MatchRequestResult,
    status_code=status.HTTP_201_CREATED,
    summary="Post a 'looking for players' request (auto-grouped)",
)
async def create_match_request(
    payload: MatchRequestCreate,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> MatchRequestResult:
    req, match = await matchmaking.post_request(
        session,
        club=ctx.club,
        member=ctx.member,
        sport=payload.sport,
        earliest_start=payload.earliest_start,
        latest_start=payload.latest_start,
        duration_mins=payload.duration_mins,
        skill_level=payload.skill_level,
        court_id=payload.court_id,
    )
    await session.commit()
    match_out = await serialize_match(session, match) if match is not None else None
    if match_out is not None:
        await _broadcast(ctx.club.id, match_out)
    return MatchRequestResult(
        request=MatchRequestOut.model_validate(req),
        match=match_out,
        confirmed=bool(match_out and match_out.status == MatchStatus.CONFIRMED),
    )


@router.post(
    "/matches",
    response_model=MatchOut,
    status_code=status.HTTP_201_CREATED,
    summary="Host an open match others can join",
)
async def host_match(
    payload: HostMatchCreate,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> MatchOut:
    match = await matchmaking.host_match(
        session,
        club=ctx.club,
        host=ctx.member,
        sport=payload.sport,
        court_id=payload.court_id,
        start_time=payload.start_time,
        duration_mins=payload.duration_mins,
        skill_level=payload.skill_level,
        title=payload.title,
    )
    await session.commit()
    mo = await serialize_match(session, match)
    await _broadcast(ctx.club.id, mo)
    return mo


@router.get("/matches", response_model=List[MatchOut], summary="Discover matches")
async def list_matches(
    status_filter: str = Query("open", alias="status"),
    sport: Optional[str] = Query(None),
    mine: bool = Query(False),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[MatchOut]:
    stmt = (
        select(Match)
        .options(selectinload(Match.participants))
        .where(Match.club_id == ctx.club.id)
    )
    if status_filter and status_filter != "all":
        stmt = stmt.where(Match.status == status_filter)
    if sport:
        stmt = stmt.where(Match.sport == sport)
    if mine:
        member_matches = (
            select(MatchParticipant.match_id)
            .where(MatchParticipant.member_id == ctx.member.id)
            .scalar_subquery()
        )
        stmt = stmt.where(Match.id.in_(member_matches))
    rows = await session.execute(stmt.order_by(Match.start_time))
    return [await serialize_match(session, m) for m in rows.scalars().all()]


@router.get("/matches/{match_id}", response_model=MatchOut, summary="Match detail")
async def get_match(
    match_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> MatchOut:
    match = await _load_match(session, ctx.club.id, match_id)
    return await serialize_match(session, match)


@router.post("/matches/{match_id}/join", response_model=MatchOut, summary="Join a match")
async def join_match(
    match_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> MatchOut:
    match = await _load_match(session, ctx.club.id, match_id, for_update=True)
    match = await matchmaking.join_match(session, club=ctx.club, match=match, member=ctx.member)
    await session.commit()
    mo = await serialize_match(session, match)
    await _broadcast(ctx.club.id, mo)
    return mo


@router.post("/matches/{match_id}/leave", summary="Leave a match")
async def leave_match(
    match_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    match = await _load_match(session, ctx.club.id, match_id, for_update=True)
    result = await matchmaking.leave_match(session, club=ctx.club, match=match, member=ctx.member)
    await session.commit()
    await _broadcast(ctx.club.id, await serialize_match(session, match))
    return result


@router.get(
    "/match-requests",
    response_model=List[MatchRequestOut],
    summary="My looking-for-players requests",
)
async def my_requests(
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> List[MatchRequestOut]:
    rows = await session.execute(
        select(MatchRequest)
        .where(
            MatchRequest.club_id == ctx.club.id,
            MatchRequest.requester_id == ctx.member.id,
        )
        .order_by(MatchRequest.created_at.desc())
    )
    return [MatchRequestOut.model_validate(r) for r in rows.scalars().all()]


@router.get(
    "/public/matches/{match_id}",
    response_model=MatchOut,
    tags=["public"],
    summary="Public match view for share links (no auth)",
)
async def public_match(
    match_id: uuid.UUID, session: AsyncSession = Depends(get_db)
) -> MatchOut:
    """Read a single match without authentication so a shared link renders for
    anyone. Only presentational fields are returned (see MatchOut) — enough for
    the poster and the invite-to-fill flow; joining still requires signing in."""
    row = await session.execute(
        select(Match).options(selectinload(Match.participants)).where(Match.id == match_id)
    )
    match = row.scalars().first()
    if match is None:
        raise NotFoundError("Match not found.")
    return await serialize_match(session, match)
