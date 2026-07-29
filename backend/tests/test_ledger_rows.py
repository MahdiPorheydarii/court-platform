"""Ledger-assignment rules (pure — no database).

Covers how a court fee is distributed across a split, including the
club-absorbs-empty-seats policy.
"""
import uuid

from app.services.booking import _build_ledger_rows


HOST = uuid.uuid4()
M1 = uuid.uuid4()
M2 = uuid.uuid4()


def test_host_absorbs_unclaimed_shares_by_default():
    # Split 4 ways but only the host is known -> host owes the whole total.
    rows = _build_ledger_rows(4800, 4, HOST, [])
    assert rows == [(HOST, 4800)]
    assert sum(a for _, a in rows) == 4800


def test_known_members_take_shares_host_absorbs_the_rest():
    rows = _build_ledger_rows(4800, 4, HOST, [M1, M2])
    amounts = dict(rows)
    # Two invitees pay one share each; the host covers their own + the empty seat.
    assert amounts[M1] == 1200
    assert amounts[M2] == 1200
    assert amounts[HOST] == 2400
    assert sum(a for _, a in rows) == 4800  # reconciles to the full total


def test_absorb_policy_bills_one_quorum_share_each_club_eats_the_rest():
    # Quorum 4, only 2 players present, club absorbs the 2 empty seats.
    rows = _build_ledger_rows(4800, 4, HOST, [M1], absorb_unclaimed=True)
    amounts = dict(rows)
    assert amounts[HOST] == 1200
    assert amounts[M1] == 1200
    # Present players each pay exactly one quorum-share; total billed < court fee.
    assert sum(a for _, a in rows) == 2400


def test_uneven_total_still_reconciles():
    rows = _build_ledger_rows(3200, 3, HOST, [M1, M2])
    assert sum(a for _, a in rows) == 3200
    assert len(rows) == 3


def test_duplicate_and_self_invites_are_ignored():
    rows = _build_ledger_rows(4800, 4, HOST, [HOST, M1, M1])
    # HOST-as-invitee and the duplicate M1 collapse; still reconciles.
    members = [m for m, _ in rows]
    assert members.count(M1) == 1
    assert HOST in members
    assert sum(a for _, a in rows) == 4800
