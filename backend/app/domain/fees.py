"""Fee computation and splitting — pure, integer-cent arithmetic.

All money is in integer cents. Splits always sum back to the exact total (the
remainder cents are distributed one-per-player to the first players), so a
ledger built from these numbers reconciles to the penny.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional


def compute_total_fee_cents(
    base_rate_per_hour_cents: int,
    duration_mins: int,
    peak_multiplier: float,
    is_peak: bool,
) -> int:
    """Total court fee = base_rate × hours × (peak multiplier if applicable).

    Rounded half-up to the nearest cent using Decimal so results are exact and
    reproducible (never float drift).
    """
    if duration_mins <= 0:
        raise ValueError("duration_mins must be positive")
    hours = Decimal(duration_mins) / Decimal(60)
    rate = Decimal(base_rate_per_hour_cents)
    multiplier = Decimal(str(peak_multiplier)) if is_peak else Decimal(1)
    total = (rate * hours * multiplier).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(total)


def split_evenly(total_cents: int, num_players: int) -> List[int]:
    """Divide ``total_cents`` across ``num_players`` as evenly as possible.

    The list always sums to exactly ``total_cents``. Extra cents (when the total
    doesn't divide evenly) go to the earliest players, one each.

    >>> split_evenly(3200, 3)
    [1067, 1067, 1066]
    >>> sum(split_evenly(3200, 3))
    3200
    """
    if num_players <= 0:
        raise ValueError("num_players must be positive")
    if total_cents < 0:
        raise ValueError("total_cents must be non-negative")
    base = total_cents // num_players
    remainder = total_cents - base * num_players
    return [base + (1 if i < remainder else 0) for i in range(num_players)]


def _parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def is_peak(start: datetime, peak_windows: List[Dict[str, Any]]) -> bool:
    """Whether ``start`` falls inside any configured peak window.

    Windows are evaluated against the datetime's own wall-clock (day-of-week and
    HH:MM). Callers are expected to pass a datetime already expressed in the
    club's local timezone. A window is ``[start, end)``.
    """
    weekday = start.weekday()  # 0=Mon
    moment = start.time()
    for window in peak_windows:
        days = window.get("days")
        if days is not None and weekday not in days:
            continue
        w_start = _parse_hhmm(window["start"])
        w_end = _parse_hhmm(window["end"])
        if w_start <= moment < w_end:
            return True
    return False


@dataclass(frozen=True)
class FeeBreakdown:
    total_cents: int
    per_player_cents: List[int]
    num_players: int
    is_peak: bool
    currency: str

    @property
    def per_player_display_cents(self) -> int:
        """The largest individual share (what a joining player is quoted)."""
        return max(self.per_player_cents) if self.per_player_cents else 0


def build_fee_breakdown(
    base_rate_per_hour_cents: int,
    duration_mins: int,
    peak_multiplier: float,
    is_peak_flag: bool,
    num_players: int,
    currency: str = "USD",
) -> FeeBreakdown:
    total = compute_total_fee_cents(
        base_rate_per_hour_cents, duration_mins, peak_multiplier, is_peak_flag
    )
    shares = split_evenly(total, num_players)
    return FeeBreakdown(
        total_cents=total,
        per_player_cents=shares,
        num_players=num_players,
        is_peak=is_peak_flag,
        currency=currency,
    )


def apply_unfilled_policy(
    policy: str,
    total_cents: int,
    present_players: int,
    quorum: int,
) -> Optional[List[int]]:
    """Resolve how an under-filled match is charged.

    Returns the per-*present-player* cents list, or ``None`` when the match
    should be voided with no charge.

    * ``cancel``  -> None (void, refund any holds)
    * ``partial`` -> present players split the whole fee between them
    * ``absorb``  -> present players each pay only their fair 1/quorum share;
                     the club absorbs the empty seats.
    """
    if present_players <= 0:
        return None
    if policy == "partial":
        return split_evenly(total_cents, present_players)
    if policy == "absorb":
        full = split_evenly(total_cents, quorum)
        # Each present player pays one quorum-share; empty seats are the club's.
        return full[:present_players]
    # Default / "cancel"
    return None
