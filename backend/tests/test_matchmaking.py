"""Matchmaking grouping logic — pure, no database.

Verifies that compatible requests cluster and incompatible ones don't:
sport, time-window overlap, skill proximity, court preference, capacity, and
the "a member is never in two groups" invariant.
"""
from datetime import datetime, timedelta

from app.domain.matching import Candidate, group_candidates, skill_rank


MAX = {"padel": 4, "tennis": 2}
BASE = datetime(2024, 6, 1, 18, 0)


def make(
    id_,
    member_id=None,
    sport="padel",
    level="Intermediate",
    earliest=BASE,
    latest=None,
    duration=90,
    court=None,
    created=None,
):
    return Candidate(
        id=id_,
        member_id=member_id or f"member-{id_}",
        sport=sport,
        skill_level=level,
        earliest_start=earliest,
        latest_start=latest or (earliest + timedelta(hours=2)),
        duration_mins=duration,
        court_id=court,
        created_at=created or BASE,
    )


def test_four_compatible_padel_requests_form_one_group():
    cands = [make(f"r{i}") for i in range(4)]
    groups = group_candidates(cands, MAX, skill_tolerance=1)
    assert len(groups) == 1
    assert groups[0].size == 4
    assert sorted(groups[0].member_ids) == sorted(c.member_id for c in cands)


def test_group_respects_max_players_cap():
    # Five compatible padel requests, cap 4 -> a full group of 4 + a leftover.
    cands = [make(f"r{i}") for i in range(5)]
    groups = group_candidates(cands, MAX, skill_tolerance=1)
    sizes = sorted(g.size for g in groups)
    assert sizes == [1, 4]
    # No member appears twice across groups.
    all_members = [m for g in groups for m in g.member_ids]
    assert len(all_members) == len(set(all_members)) == 5


def test_skill_gap_beyond_tolerance_is_not_grouped():
    beginner = make("r1", level="Beginner")   # rank 1
    advanced = make("r2", level="Advanced")   # rank 4
    groups = group_candidates([beginner, advanced], MAX, skill_tolerance=1)
    # spread of 3 > tolerance 1 -> two singleton groups
    assert len(groups) == 2
    assert all(g.size == 1 for g in groups)


def test_adjacent_skill_within_tolerance_groups():
    a = make("r1", level="Intermediate")  # 3
    b = make("r2", level="Improver")      # 2
    groups = group_candidates([a, b], MAX, skill_tolerance=1)
    assert len(groups) == 1
    assert groups[0].size == 2


def test_non_overlapping_time_windows_split():
    early = make("r1", earliest=BASE, latest=BASE + timedelta(minutes=30))
    late = make(
        "r2",
        earliest=BASE + timedelta(hours=3),
        latest=BASE + timedelta(hours=4),
    )
    groups = group_candidates([early, late], MAX, skill_tolerance=1)
    assert len(groups) == 2


def test_overlapping_windows_intersect_to_common_start():
    a = make("r1", earliest=BASE, latest=BASE + timedelta(hours=2))
    b = make(
        "r2",
        earliest=BASE + timedelta(hours=1),
        latest=BASE + timedelta(hours=3),
    )
    groups = group_candidates([a, b], MAX, skill_tolerance=1)
    assert len(groups) == 1
    # Common window starts at the later of the two earliest times.
    assert groups[0].start_time == BASE + timedelta(hours=1)


def test_conflicting_court_preferences_do_not_mix():
    a = make("r1", court="court-A")
    b = make("r2", court="court-B")
    groups = group_candidates([a, b], MAX, skill_tolerance=1)
    assert len(groups) == 2


def test_court_preference_and_no_preference_can_mix():
    a = make("r1", court="court-A")
    b = make("r2", court=None)
    groups = group_candidates([a, b], MAX, skill_tolerance=1)
    assert len(groups) == 1
    assert groups[0].court_id == "court-A"


def test_different_sports_never_group_together():
    padel = make("r1", sport="padel")
    tennis = make("r2", sport="tennis")
    groups = group_candidates([padel, tennis], MAX, skill_tolerance=1)
    assert len(groups) == 2


def test_different_durations_do_not_mix():
    a = make("r1", duration=90)
    b = make("r2", duration=60)
    groups = group_candidates([a, b], MAX, skill_tolerance=1)
    assert len(groups) == 2


def test_skill_ranks_are_ordered():
    assert skill_rank("Beginner") < skill_rank("Improver") < skill_rank("Intermediate") < skill_rank("Advanced")
