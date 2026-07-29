"""Matchmaking grouping — pure logic.

Given a set of open "looking for players" requests, cluster the compatible ones
into candidate matches. Compatibility means: same sport, overlapping time
windows (a common start time exists), skill within the club's tolerance, and
compatible court preferences.

The algorithm is a deterministic greedy clusterer: requests are processed
oldest-first; each seeds a group that then absorbs the next compatible requests
up to ``max_players``. It is intentionally explainable rather than globally
optimal — a member should be able to understand *why* they were grouped.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


SKILL_RANKS: Dict[str, int] = {
    "Beginner": 1,
    "Improver": 2,
    "Intermediate": 3,
    "Advanced": 4,
}
_RANK_TO_LEVEL = {v: k for k, v in SKILL_RANKS.items()}


def skill_rank(level: str) -> int:
    return SKILL_RANKS.get(level, 3)


def rank_to_level(rank: int) -> str:
    rank = max(1, min(4, rank))
    return _RANK_TO_LEVEL[rank]


@dataclass(frozen=True)
class Candidate:
    """A single open request considered for grouping."""

    id: str
    member_id: str
    sport: str
    skill_level: str
    earliest_start: datetime
    latest_start: datetime
    duration_mins: int
    court_id: Optional[str] = None
    created_at: Optional[datetime] = None

    @property
    def rank(self) -> int:
        return skill_rank(self.skill_level)


@dataclass
class Group:
    sport: str
    duration_mins: int
    member_ids: List[str] = field(default_factory=list)
    candidate_ids: List[str] = field(default_factory=list)
    window_lo: Optional[datetime] = None  # latest earliest_start
    window_hi: Optional[datetime] = None  # earliest latest_start
    court_id: Optional[str] = None
    min_rank: int = 99
    max_rank: int = 0

    @property
    def size(self) -> int:
        return len(self.member_ids)

    @property
    def start_time(self) -> datetime:
        # The earliest time everyone in the group can commit to.
        return self.window_lo  # type: ignore[return-value]

    @property
    def skill_level(self) -> str:
        avg = round((self.min_rank + self.max_rank) / 2)
        return rank_to_level(avg)


def _fits(group: Group, c: Candidate, tolerance: int) -> bool:
    if c.sport != group.sport:
        return False
    if c.duration_mins != group.duration_mins:
        return False
    # Time windows must still share a common instant.
    new_lo = max(group.window_lo, c.earliest_start)  # type: ignore[arg-type]
    new_hi = min(group.window_hi, c.latest_start)  # type: ignore[arg-type]
    if new_lo > new_hi:
        return False
    # Skill spread across the whole group must stay within tolerance.
    lo_rank = min(group.min_rank, c.rank)
    hi_rank = max(group.max_rank, c.rank)
    if hi_rank - lo_rank > tolerance:
        return False
    # Court preference: two different explicit preferences don't mix.
    if group.court_id is not None and c.court_id is not None and group.court_id != c.court_id:
        return False
    return True


def _add(group: Group, c: Candidate) -> None:
    group.member_ids.append(c.member_id)
    group.candidate_ids.append(c.id)
    group.window_lo = c.earliest_start if group.window_lo is None else max(group.window_lo, c.earliest_start)
    group.window_hi = c.latest_start if group.window_hi is None else min(group.window_hi, c.latest_start)
    if group.court_id is None:
        group.court_id = c.court_id
    group.min_rank = min(group.min_rank, c.rank)
    group.max_rank = max(group.max_rank, c.rank)


def group_candidates(
    candidates: List[Candidate],
    max_players: Dict[str, int],
    skill_tolerance: int = 1,
) -> List[Group]:
    """Cluster compatible candidates into groups.

    ``max_players`` maps sport -> cap. Returns every cluster formed, including
    partial ones (below the confirm threshold) — the caller decides which
    clusters are large enough to confirm vs. keep open.

    A member is never placed in two groups. Ordering is oldest-first
    (``created_at`` then ``earliest_start``) for determinism.
    """

    def sort_key(c: Candidate):
        return (c.created_at or c.earliest_start, c.earliest_start, c.id)

    by_sport: Dict[str, List[Candidate]] = {}
    for c in candidates:
        by_sport.setdefault(c.sport, []).append(c)

    groups: List[Group] = []
    for sport, items in by_sport.items():
        cap = max_players.get(sport, 4)
        pool = sorted(items, key=sort_key)
        used = set()
        seen_members = set()
        for seed in pool:
            if seed.id in used or seed.member_id in seen_members:
                continue
            group = Group(sport=sport, duration_mins=seed.duration_mins)
            _add(group, seed)
            used.add(seed.id)
            seen_members.add(seed.member_id)
            for other in pool:
                if group.size >= cap:
                    break
                if other.id in used or other.member_id in seen_members:
                    continue
                if _fits(group, other, skill_tolerance):
                    _add(group, other)
                    used.add(other.id)
                    seen_members.add(other.member_id)
            groups.append(group)
    return groups
