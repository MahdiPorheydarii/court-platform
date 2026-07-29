"""Fee-split math: totals, peak multipliers, even division, and policies.

Pure logic — no database required.
"""
from datetime import datetime

import pytest

from app.domain.fees import (
    apply_unfilled_policy,
    build_fee_breakdown,
    compute_total_fee_cents,
    is_peak,
    split_evenly,
)


# --------------------------------------------------------------------------- #
#  Totals                                                                       #
# --------------------------------------------------------------------------- #
def test_total_off_peak_is_rate_times_hours():
    # $32/hr for 90 minutes, off-peak -> $48.00
    assert compute_total_fee_cents(3200, 90, 1.25, is_peak=False) == 4800


def test_total_applies_peak_multiplier_when_peak():
    # $32/hr for 90 minutes, peak x1.25 -> $60.00
    assert compute_total_fee_cents(3200, 90, 1.25, is_peak=True) == 6000


def test_total_hourly_at_sixty_minutes():
    assert compute_total_fee_cents(2400, 60, 1.2, is_peak=True) == 2880
    assert compute_total_fee_cents(2400, 60, 1.2, is_peak=False) == 2400


def test_total_rounds_half_up_to_the_cent():
    # 3333 * 1.5 = 4999.5 -> 5000
    assert compute_total_fee_cents(3333, 90, 1.0, is_peak=False) == 5000


def test_total_rejects_nonpositive_duration():
    with pytest.raises(ValueError):
        compute_total_fee_cents(3200, 0, 1.0, is_peak=False)


# --------------------------------------------------------------------------- #
#  Even split                                                                   #
# --------------------------------------------------------------------------- #
def test_split_divides_evenly_when_divisible():
    assert split_evenly(4800, 4) == [1200, 1200, 1200, 1200]


def test_split_distributes_remainder_cents_to_first_players():
    # $32.00 across 3 -> 10.67, 10.67, 10.66
    assert split_evenly(3200, 3) == [1067, 1067, 1066]


@pytest.mark.parametrize(
    "total,n",
    [(3200, 3), (100, 3), (999, 7), (1, 4), (5000, 6), (12345, 11)],
)
def test_split_always_sums_to_total(total, n):
    shares = split_evenly(total, n)
    assert sum(shares) == total
    assert len(shares) == n
    # Shares differ by at most one cent — the definition of "even".
    assert max(shares) - min(shares) <= 1


def test_split_rejects_zero_players():
    with pytest.raises(ValueError):
        split_evenly(1000, 0)


# --------------------------------------------------------------------------- #
#  Breakdown                                                                    #
# --------------------------------------------------------------------------- #
def test_breakdown_padel_peak_four_players():
    bd = build_fee_breakdown(
        base_rate_per_hour_cents=3200,
        duration_mins=90,
        peak_multiplier=1.25,
        is_peak_flag=True,
        num_players=4,
    )
    assert bd.total_cents == 6000
    assert bd.per_player_cents == [1500, 1500, 1500, 1500]
    assert sum(bd.per_player_cents) == bd.total_cents
    assert bd.per_player_display_cents == 1500


# --------------------------------------------------------------------------- #
#  Peak detection                                                               #
# --------------------------------------------------------------------------- #
WEEKDAY_EVENING = [{"days": [0, 1, 2, 3, 4], "start": "17:00", "end": "21:00"}]
WEEKEND_MORNING = [{"days": [5, 6], "start": "09:00", "end": "13:00"}]
DEFAULT_WINDOWS = WEEKDAY_EVENING + WEEKEND_MORNING


def test_peak_true_inside_weekday_evening():
    # Monday 2024-01-01 18:30
    assert is_peak(datetime(2024, 1, 1, 18, 30), DEFAULT_WINDOWS) is True


def test_peak_false_before_window():
    assert is_peak(datetime(2024, 1, 1, 15, 0), DEFAULT_WINDOWS) is False


def test_peak_end_is_exclusive():
    # 21:00 is the exclusive end -> off peak
    assert is_peak(datetime(2024, 1, 1, 21, 0), DEFAULT_WINDOWS) is False


def test_peak_weekend_morning_window():
    # Saturday 2024-01-06 10:00
    assert is_peak(datetime(2024, 1, 6, 10, 0), DEFAULT_WINDOWS) is True
    # Saturday afternoon -> off peak
    assert is_peak(datetime(2024, 1, 6, 14, 0), DEFAULT_WINDOWS) is False


# --------------------------------------------------------------------------- #
#  Unfilled-match policy                                                        #
# --------------------------------------------------------------------------- #
def test_policy_cancel_returns_none():
    assert apply_unfilled_policy("cancel", 4800, present_players=2, quorum=4) is None


def test_policy_partial_splits_whole_fee_among_present():
    assert apply_unfilled_policy("partial", 4800, present_players=2, quorum=4) == [2400, 2400]


def test_policy_absorb_charges_only_fair_share():
    # $48 / 4 quorum = $12 each; 2 present -> they pay $12 each, club eats $24.
    assert apply_unfilled_policy("absorb", 4800, present_players=2, quorum=4) == [1200, 1200]


def test_policy_no_players_is_void():
    assert apply_unfilled_policy("partial", 4800, present_players=0, quorum=4) is None
