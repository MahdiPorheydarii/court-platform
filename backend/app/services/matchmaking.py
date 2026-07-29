"""Matchmaking service — hosting, joining, auto-grouping, and confirmation.

Design choice: matchmaking is **event-triggered first, swept second**.

* When a request is posted or a match is joined, we immediately try to group /
  confirm — so the product feels instant ("your match is set").
* A lightweight background sweep (see ``app.scheduler``) is the safety net: it
  regroups requests that couldn't pair when they arrived, expires stale
  requests, and resolves matches whose start time passed under-filled.

The pure grouping rules live in ``app.domain.matching`` and are unit-tested
without a database.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..domain import fees as fee_logic
from ..domain.config import ClubConfig
from ..domain.matching import Candidate, group_candidates, skill_rank
from ..errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from ..models import (
    Booking,
    BookingSource,
    BookingStatus,
    Club,
    Court,
    LedgerStatus,
    Match,
    MatchParticipant,
    MatchRequest,
    MatchStatus,
    Member,
    RequestStatus,
    LedgerEntry,
)
from .booking import create_booking
from .notifications import notify_many


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _title_for(sport: str) -> str:
    return "Padel match" if sport == "padel" else "Tennis match"


# --------------------------------------------------------------------------- #
#  Court availability                                                           #
# --------------------------------------------------------------------------- #
async def _find_free_court(
    session: AsyncSession,
    club: Club,
    sport: str,
    start: datetime,
    end: datetime,
    preferred: Optional[uuid.UUID] = None,
) -> Optional[Court]:
    overlapping = (
        select(Booking.court_id)
        .where(
            Booking.club_id == club.id,
            Booking.status != BookingStatus.CANCELLED,
            Booking.start_time < end,
            Booking.end_time > start,
        )
        .scalar_subquery()
    )
    base = select(Court).where(
        Court.club_id == club.id,
        Court.sport == sport,
        Court.is_active.is_(True),
        Court.id.notin_(overlapping),
    )
    if preferred is not None:
        pref = await session.execute(base.where(Court.id == preferred))
        found = pref.scalars().first()
        if found is not None:
            return found
    res = await session.execute(base.order_by(Court.name))
    return res.scalars().first()


# --------------------------------------------------------------------------- #
#  Confirmation                                                                 #
# --------------------------------------------------------------------------- #
async def _confirm_match(
    session: AsyncSession,
    club: Club,
    match: Match,
    *,
    fee_split_count: Optional[int] = None,
    absorb_unclaimed: bool = False,
) -> bool:
    """Turn a filled open match into a booking + fee split. Returns success.

    By default the fee is split evenly among the players present. For the
    ``absorb`` unfilled policy, pass ``fee_split_count=min_players`` and
    ``absorb_unclaimed=True`` so each present player pays only one quorum-share
    and the club covers the empty seats.

    Idempotent-ish: a match already confirmed is left alone.
    """
    if match.status != MatchStatus.OPEN:
        return match.status == MatchStatus.CONFIRMED

    start, end = _aware(match.start_time), _aware(match.end_time)
    court = await _find_free_court(session, club, match.sport, start, end, preferred=match.court_id)
    if court is None:
        return False  # no court free right now; stay open, sweep will retry
    match.court_id = court.id

    participants = sorted(match.participants, key=lambda p: p.joined_at)
    participant_ids = [p.member_id for p in participants]
    num = len(participant_ids)
    if num == 0:
        return False

    host_id = match.host_member_id or participant_ids[0]
    host = await session.get(Member, host_id)
    if host is None:
        return False
    invitees = [mid for mid in participant_ids if mid != host_id]
    split_count = fee_split_count or num

    try:
        booking = await create_booking(
            session,
            club=club,
            host=host,
            court_id=court.id,
            start_time=start,
            duration_mins=match.duration_mins,
            title=match.title,
            split_count=split_count,
            invitee_ids=invitees,
            source=BookingSource.MATCH,
            match_id=match.id,
            absorb_unclaimed=absorb_unclaimed,
        )
    except ConflictError:
        return False  # court got taken in a race; stay open

    match.booking_id = booking.id
    match.status = MatchStatus.CONFIRMED
    match.confirmed_at = _now()
    # Ceil so the quoted per-person never under-states a player's actual share.
    match.price_per_person_cents = -(-booking.total_fee_cents // split_count)

    # Mark the linked requests as satisfied.
    reqs = (
        await session.execute(
            select(MatchRequest).where(MatchRequest.match_id == match.id)
        )
    ).scalars().all()
    for r in reqs:
        r.status = RequestStatus.MATCHED

    await session.flush()
    await notify_many(
        session,
        club_id=club.id,
        member_ids=participant_ids,
        type="match_confirmed",
        title="Your match is confirmed",
        body=f"{match.title} at {court.name} is locked in — court fee split {num} ways.",
        data={
            "match_id": str(match.id),
            "booking_id": str(booking.id),
            "court": court.name,
            "start_time": start.isoformat(),
        },
    )
    return True


# --------------------------------------------------------------------------- #
#  Absorbing waiting requests into an open match                                #
# --------------------------------------------------------------------------- #
def _skill_ok(cfg: ClubConfig, level_a: str, level_b: str) -> bool:
    return abs(skill_rank(level_a) - skill_rank(level_b)) <= cfg.skill_tolerance


async def _absorb_open_requests(session: AsyncSession, club: Club, match: Match) -> int:
    """Pull compatible waiting requests into an open match. Returns count added."""
    cfg = ClubConfig(club.config)
    spots_left = match.max_players - len(match.participants)
    if spots_left <= 0:
        return 0
    existing = {p.member_id for p in match.participants}
    start = _aware(match.start_time)

    rows = await session.execute(
        select(MatchRequest).where(
            MatchRequest.club_id == club.id,
            MatchRequest.sport == match.sport,
            MatchRequest.status == RequestStatus.OPEN,
            MatchRequest.match_id.is_(None),
            MatchRequest.duration_mins == match.duration_mins,
            MatchRequest.earliest_start <= start,
            MatchRequest.latest_start >= start,
        ).order_by(MatchRequest.created_at)
    )
    added = 0
    for req in rows.scalars().all():
        if spots_left <= 0:
            break
        if req.requester_id in existing:
            continue
        if not _skill_ok(cfg, req.skill_level, match.skill_level):
            continue
        if req.court_id is not None and match.court_id is not None and req.court_id != match.court_id:
            continue
        match.participants.append(
            MatchParticipant(member_id=req.requester_id, request_id=req.id, role="player")
        )
        req.status = RequestStatus.MATCHED
        req.match_id = match.id
        existing.add(req.requester_id)
        spots_left -= 1
        added += 1
    if added:
        await session.flush()
    return added


# --------------------------------------------------------------------------- #
#  Public: host a match                                                         #
# --------------------------------------------------------------------------- #
async def host_match(
    session: AsyncSession,
    *,
    club: Club,
    host: Member,
    sport: str,
    court_id: Optional[uuid.UUID],
    start_time: datetime,
    duration_mins: int,
    skill_level: Optional[str] = None,
    title: Optional[str] = None,
) -> Match:
    cfg = ClubConfig(club.config)
    if sport not in cfg.sports:
        raise ValidationError(f"This club does not offer {sport}.")
    start = _aware(start_time)
    end = start + timedelta(minutes=duration_mins)

    if court_id is not None:
        court = await session.get(Court, court_id)
        if court is None or court.club_id != club.id or court.sport != sport:
            raise NotFoundError("Court not found for that sport.")

    match = Match(
        club_id=club.id,
        court_id=court_id,
        host_member_id=host.id,
        title=title or _title_for(sport),
        sport=sport,
        skill_level=skill_level or host.skill_level,
        start_time=start,
        end_time=end,
        duration_mins=duration_mins,
        min_players=cfg.min_players(sport),
        max_players=cfg.max_players(sport),
        status=MatchStatus.OPEN,
    )
    match.participants.append(
        MatchParticipant(member_id=host.id, role="host")
    )
    session.add(match)
    await session.flush()

    # Instantly try to fill from members already waiting for a game.
    await _absorb_open_requests(session, club, match)
    if len(match.participants) >= match.min_players:
        await _confirm_match(session, club, match)
    return match


# --------------------------------------------------------------------------- #
#  Public: join / leave                                                         #
# --------------------------------------------------------------------------- #
async def join_match(
    session: AsyncSession, *, club: Club, match: Match, member: Member
) -> Match:
    if match.status != MatchStatus.OPEN:
        raise ConflictError("This match is no longer open to join.")
    if any(p.member_id == member.id for p in match.participants):
        raise ConflictError("You're already in this match.")
    if len(match.participants) >= match.max_players:
        raise ConflictError("This match is full.")

    match.participants.append(MatchParticipant(member_id=member.id, role="player"))
    await session.flush()

    others = [p.member_id for p in match.participants if p.member_id != member.id]
    await notify_many(
        session,
        club_id=club.id,
        member_ids=others,
        type="match_joined",
        title=f"{member.name} joined your match",
        body=f"{len(match.participants)} of {match.max_players} in for {match.title}.",
        data={"match_id": str(match.id)},
    )
    if len(match.participants) >= match.min_players:
        await _confirm_match(session, club, match)
    return match


async def leave_match(
    session: AsyncSession, *, club: Club, match: Match, member: Member
) -> dict:
    part = next((p for p in match.participants if p.member_id == member.id), None)
    if part is None:
        raise ConflictError("You're not part of this match.")

    cfg = ClubConfig(club.config)
    result = {"left": True, "charge_waived": True, "match_cancelled": False}

    if match.status == MatchStatus.CONFIRMED:
        # Leaving a confirmed match: waive the charge only if outside the window.
        start = _aware(match.start_time)
        within = _now() > (start - timedelta(hours=cfg.cancellation_window_hours))
        result["charge_waived"] = not within
        if not within:
            entries = (
                await session.execute(
                    select(LedgerEntry).where(
                        LedgerEntry.match_id == match.id,
                        LedgerEntry.member_id == member.id,
                        LedgerEntry.status == LedgerStatus.OWED,
                    )
                )
            ).scalars().all()
            for e in entries:
                e.status = LedgerStatus.WAIVED

    match.participants.remove(part)
    # Detach any request that fed this participation so it can rematch.
    if part.request_id:
        req = await session.get(MatchRequest, part.request_id)
        if req is not None and req.status == RequestStatus.MATCHED:
            req.status = RequestStatus.OPEN
            req.match_id = None

    remaining = list(match.participants)
    if not remaining and match.status == MatchStatus.OPEN:
        match.status = MatchStatus.CANCELLED
        result["match_cancelled"] = True
    elif remaining and match.host_member_id == member.id:
        # Hand the host role to the next-earliest player.
        new_host = sorted(remaining, key=lambda p: p.joined_at)[0]
        match.host_member_id = new_host.member_id
        new_host.role = "host"

    await session.flush()
    if remaining:
        await notify_many(
            session,
            club_id=club.id,
            member_ids=[p.member_id for p in remaining],
            type="match_left",
            title=f"{member.name} left the match",
            body=f"{len(remaining)} still in for {match.title}.",
            data={"match_id": str(match.id)},
        )
    return result


# --------------------------------------------------------------------------- #
#  Public: post a request (auto-grouped)                                        #
# --------------------------------------------------------------------------- #
async def _try_absorb_into_existing_match(
    session: AsyncSession, club: Club, req: MatchRequest, member: Member
) -> Optional[Match]:
    cfg = ClubConfig(club.config)
    earliest, latest = _aware(req.earliest_start), _aware(req.latest_start)
    rows = await session.execute(
        select(Match).where(
            Match.club_id == club.id,
            Match.sport == req.sport,
            Match.status == MatchStatus.OPEN,
            Match.duration_mins == req.duration_mins,
            Match.start_time >= earliest,
            Match.start_time <= latest,
        ).order_by(Match.start_time)
    )
    for match in rows.scalars().all():
        if len(match.participants) >= match.max_players:
            continue
        if any(p.member_id == member.id for p in match.participants):
            continue
        if not _skill_ok(cfg, req.skill_level, match.skill_level):
            continue
        if req.court_id is not None and match.court_id is not None and req.court_id != match.court_id:
            continue
        match.participants.append(
            MatchParticipant(member_id=member.id, request_id=req.id, role="player")
        )
        req.status = RequestStatus.MATCHED
        req.match_id = match.id
        await session.flush()
        if len(match.participants) >= match.min_players:
            await _confirm_match(session, club, match)
        return match
    return None


async def _group_open_requests(
    session: AsyncSession, club: Club, sport: str
) -> List[Match]:
    """Cluster all currently-open requests of a sport into matches."""
    cfg = ClubConfig(club.config)
    rows = await session.execute(
        select(MatchRequest).where(
            MatchRequest.club_id == club.id,
            MatchRequest.sport == sport,
            MatchRequest.status == RequestStatus.OPEN,
            MatchRequest.match_id.is_(None),
        ).order_by(MatchRequest.created_at)
    )
    open_reqs = list(rows.scalars().all())
    if len(open_reqs) < 2:
        return []

    candidates = [
        Candidate(
            id=str(r.id),
            member_id=str(r.requester_id),
            sport=r.sport,
            skill_level=r.skill_level,
            earliest_start=_aware(r.earliest_start),
            latest_start=_aware(r.latest_start),
            duration_mins=r.duration_mins,
            court_id=str(r.court_id) if r.court_id else None,
            created_at=_aware(r.created_at),
        )
        for r in open_reqs
    ]
    req_by_id = {str(r.id): r for r in open_reqs}
    groups = group_candidates(
        candidates,
        max_players={sport: cfg.max_players(sport)},
        skill_tolerance=cfg.skill_tolerance,
    )

    created: List[Match] = []
    for g in groups:
        if g.size < 2:
            continue  # a lone request keeps waiting
        group_reqs = [req_by_id[cid] for cid in g.candidate_ids]
        host_req = group_reqs[0]
        court_id = uuid.UUID(g.court_id) if g.court_id else None
        match = Match(
            club_id=club.id,
            court_id=court_id,
            host_member_id=host_req.requester_id,
            title=_title_for(sport),
            sport=sport,
            skill_level=g.skill_level,
            start_time=g.start_time,
            end_time=g.start_time + timedelta(minutes=g.duration_mins),
            duration_mins=g.duration_mins,
            min_players=cfg.min_players(sport),
            max_players=cfg.max_players(sport),
            status=MatchStatus.OPEN,
        )
        for i, r in enumerate(group_reqs):
            match.participants.append(
                MatchParticipant(
                    member_id=r.requester_id,
                    request_id=r.id,
                    role="host" if i == 0 else "player",
                )
            )
            r.status = RequestStatus.MATCHED
            r.match_id = None  # set after flush
        session.add(match)
        await session.flush()
        for r in group_reqs:
            r.match_id = match.id
        await session.flush()
        if len(match.participants) >= match.min_players:
            await _confirm_match(session, club, match)
        created.append(match)
    return created


async def post_request(
    session: AsyncSession,
    *,
    club: Club,
    member: Member,
    sport: str,
    earliest_start: datetime,
    latest_start: datetime,
    duration_mins: int,
    skill_level: Optional[str] = None,
    court_id: Optional[uuid.UUID] = None,
) -> Tuple[MatchRequest, Optional[Match]]:
    cfg = ClubConfig(club.config)
    if sport not in cfg.sports:
        raise ValidationError(f"This club does not offer {sport}.")
    earliest, latest = _aware(earliest_start), _aware(latest_start)
    if latest < earliest:
        raise ValidationError("latest_start must be at or after earliest_start.")
    if court_id is not None:
        court = await session.get(Court, court_id)
        if court is None or court.club_id != club.id:
            raise NotFoundError("Preferred court not found.")

    req = MatchRequest(
        club_id=club.id,
        requester_id=member.id,
        court_id=court_id,
        sport=sport,
        skill_level=skill_level or member.skill_level,
        earliest_start=earliest,
        latest_start=latest,
        duration_mins=duration_mins,
        status=RequestStatus.OPEN,
    )
    session.add(req)
    await session.flush()

    # 1) Slot into a compatible open match if one already exists.
    match = await _try_absorb_into_existing_match(session, club, req, member)
    if match is not None:
        return req, match

    # 2) Otherwise, group this request with other waiting ones.
    created = await _group_open_requests(session, club, sport)
    for m in created:
        if any(p.member_id == member.id for p in m.participants):
            return req, m
    return req, None


# --------------------------------------------------------------------------- #
#  Background sweep                                                             #
# --------------------------------------------------------------------------- #
async def sweep(session: AsyncSession, *, request_ttl_minutes: int) -> dict:
    """Periodic maintenance: expire stale requests, regroup, resolve unfilled."""
    now = _now()
    stats = {"expired_requests": 0, "matches_created": 0, "matches_resolved": 0}

    # Expire stale open requests.
    if request_ttl_minutes > 0:
        cutoff = now - timedelta(minutes=request_ttl_minutes)
        stale = (
            await session.execute(
                select(MatchRequest).where(
                    MatchRequest.status == RequestStatus.OPEN,
                    MatchRequest.match_id.is_(None),
                    MatchRequest.created_at < cutoff,
                )
            )
        ).scalars().all()
        for r in stale:
            r.status = RequestStatus.EXPIRED
            stats["expired_requests"] += 1

    # Regroup remaining open requests per (club, sport).
    pairs = (
        await session.execute(
            select(MatchRequest.club_id, MatchRequest.sport)
            .where(
                MatchRequest.status == RequestStatus.OPEN,
                MatchRequest.match_id.is_(None),
            )
            .distinct()
        )
    ).all()
    for club_id, sport in pairs:
        club = await session.get(Club, club_id)
        if club is None:
            continue
        created = await _group_open_requests(session, club, sport)
        stats["matches_created"] += len(created)

    # Resolve open matches whose start time has passed but never filled.
    past_open = (
        await session.execute(
            select(Match).where(
                Match.status == MatchStatus.OPEN,
                Match.start_time < now,
            )
        )
    ).scalars().all()
    for match in past_open:
        club = await session.get(Club, match.club_id)
        if club is None:
            continue
        await _resolve_unfilled(session, club, match)
        stats["matches_resolved"] += 1

    await session.commit()
    return stats


async def _resolve_unfilled(session: AsyncSession, club: Club, match: Match) -> None:
    cfg = ClubConfig(club.config)
    policy = cfg.unfilled_policy
    participants = list(match.participants)

    if policy == "partial" and participants:
        # Present players split the whole court fee between them.
        if await _confirm_match(session, club, match):
            return
    elif policy == "absorb" and participants:
        # Present players each pay one quorum-share; the club eats empty seats.
        if await _confirm_match(
            session,
            club,
            match,
            fee_split_count=match.min_players,
            absorb_unclaimed=True,
        ):
            return
    # Default: cancel the match, notify participants, free everyone up.
    match.status = MatchStatus.CANCELLED
    reqs = (
        await session.execute(
            select(MatchRequest).where(MatchRequest.match_id == match.id)
        )
    ).scalars().all()
    for r in reqs:
        if r.status == RequestStatus.MATCHED:
            r.status = RequestStatus.EXPIRED
    if participants:
        await notify_many(
            session,
            club_id=club.id,
            member_ids=[p.member_id for p in participants],
            type="match_cancelled",
            title="Match didn't fill in time",
            body=f"{match.title} didn't reach enough players and was cancelled. No charge.",
            data={"match_id": str(match.id)},
        )
    await session.flush()
