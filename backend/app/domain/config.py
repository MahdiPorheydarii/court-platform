"""Club configuration: a single data-driven JSON blob per tenant.

Behaviour differs per club purely through this config — no code branches per
club. ``ClubConfig`` wraps the raw dict and supplies sane defaults so a partial
or empty config never crashes a request.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


DEFAULT_CONFIG: Dict[str, Any] = {
    "sports": ["padel", "tennis"],
    "currency": "USD",
    "timezone": "UTC",
    # Per-sport pricing. base_rate is per *court* per hour, in cents.
    "fees": {
        "padel": {"base_rate_per_hour_cents": 3200, "peak_multiplier": 1.25},
        "tennis": {"base_rate_per_hour_cents": 2400, "peak_multiplier": 1.2},
    },
    # Peak windows expressed in the club's local wall-clock time.
    # days: 0=Mon … 6=Sun.
    "peak_windows": [
        {"days": [0, 1, 2, 3, 4], "start": "17:00", "end": "21:00"},
        {"days": [5, 6], "start": "09:00", "end": "13:00"},
    ],
    # Minimum players before a match auto-confirms, per sport.
    "min_players": {"padel": 4, "tennis": 2},
    "max_players": {"padel": 4, "tennis": 2},
    # Daily bookable window (club-local wall clock) and default slot lengths.
    "operating_hours": {"start": "08:00", "end": "22:00"},
    "slot_minutes": {"padel": 90, "tennis": 60},
    "cancellation_window_hours": 12,
    # How far apart (in skill bands) two players can be and still be matched.
    "match_skill_tolerance": 1,
    # What happens to a match that never reaches min_players by its start time.
    #   cancel  -> void it, no charge (default)
    #   absorb  -> confirm anyway, club eats the empty seats' share
    #   partial -> confirm anyway, present players split the whole fee
    "unfilled_policy": "cancel",
}


@dataclass(frozen=True)
class SportFee:
    base_rate_per_hour_cents: int
    peak_multiplier: float


class ClubConfig:
    def __init__(self, raw: Dict[str, Any] | None):
        self._raw = raw or {}

    def _get(self, key: str) -> Any:
        if key in self._raw and self._raw[key] is not None:
            return self._raw[key]
        return DEFAULT_CONFIG[key]

    @property
    def currency(self) -> str:
        return self._get("currency")

    @property
    def sports(self) -> List[str]:
        return list(self._get("sports"))

    @property
    def peak_windows(self) -> List[Dict[str, Any]]:
        return list(self._get("peak_windows"))

    @property
    def cancellation_window_hours(self) -> int:
        return int(self._get("cancellation_window_hours"))

    @property
    def skill_tolerance(self) -> int:
        return int(self._get("match_skill_tolerance"))

    @property
    def unfilled_policy(self) -> str:
        return str(self._get("unfilled_policy"))

    def fee_for(self, sport: str) -> SportFee:
        fees = self._get("fees")
        raw = fees.get(sport) or DEFAULT_CONFIG["fees"].get(
            sport, {"base_rate_per_hour_cents": 3000, "peak_multiplier": 1.0}
        )
        return SportFee(
            base_rate_per_hour_cents=int(raw["base_rate_per_hour_cents"]),
            peak_multiplier=float(raw["peak_multiplier"]),
        )

    def min_players(self, sport: str) -> int:
        return int(self._get("min_players").get(sport, 2))

    def max_players(self, sport: str) -> int:
        return int(self._get("max_players").get(sport, self.min_players(sport)))

    def slot_minutes(self, sport: str) -> int:
        return int(self._get("slot_minutes").get(sport, 90))

    @property
    def operating_hours(self) -> Dict[str, str]:
        return dict(self._get("operating_hours"))

    def to_dict(self) -> Dict[str, Any]:
        merged = dict(DEFAULT_CONFIG)
        merged.update(self._raw)
        return merged


def merge_config(existing: Dict[str, Any] | None, patch: Dict[str, Any]) -> Dict[str, Any]:
    """Shallow-merge a config patch onto an existing config (one level deep for
    nested dicts like ``fees`` / ``min_players``)."""
    result: Dict[str, Any] = dict(existing or {})
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            nested = dict(result[key])
            nested.update(value)
            result[key] = nested
        else:
            result[key] = value
    return result
