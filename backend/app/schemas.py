"""Pydantic request/response models (API v1).

Money is exposed to clients in two forms: ``*_cents`` (integer, authoritative)
and a convenience float in the major unit (e.g. dollars) for display. The
frontend can use whichever it prefers.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --------------------------------------------------------------------------- #
#  Errors                                                                       #
# --------------------------------------------------------------------------- #
class ErrorBody(BaseModel):
    code: str = Field(examples=["conflict"])
    message: str = Field(examples=["That court slot was just booked."])
    details: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# --------------------------------------------------------------------------- #
#  Auth & onboarding                                                            #
# --------------------------------------------------------------------------- #
class ClubRegister(BaseModel):
    club_name: str = Field(min_length=2, max_length=120, examples=["Riverside Padel"])
    slug: str = Field(
        min_length=2,
        max_length=63,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
        examples=["riverside"],
    )
    admin_name: str = Field(min_length=1, max_length=120, examples=["Alex Rivera"])
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=128)
    config: Optional[Dict[str, Any]] = None


class LoginRequest(BaseModel):
    slug: str = Field(examples=["riverside"])
    email: EmailStr
    password: str


class MemberRegister(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    skill_level: str = Field(default="Intermediate")


class MemberUpdate(BaseModel):
    """Editable profile fields — notably skill level, so it's remembered."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    skill_level: Optional[str] = Field(
        default=None, examples=["Beginner", "Improver", "Intermediate", "Advanced"]
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    member: "MemberOut"
    club: "ClubOut"


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    skill_level: str
    tone: str
    initials: str = ""

    @classmethod
    def from_model(cls, m) -> "MemberOut":
        initials = "".join(part[0] for part in m.name.split()[:2]).upper() or "?"
        return cls(
            id=m.id,
            name=m.name,
            email=m.email,
            role=m.role,
            skill_level=m.skill_level,
            tone=m.tone,
            initials=initials,
        )


class PlayerOut(BaseModel):
    id: uuid.UUID
    name: str
    initials: str
    level: str
    tone: str


# --------------------------------------------------------------------------- #
#  Club & courts                                                                #
# --------------------------------------------------------------------------- #
class ClubOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    config: Dict[str, Any]


class ClubConfigUpdate(BaseModel):
    """Partial patch of the club config blob (shallow-merged, one level deep)."""

    config: Dict[str, Any]


class CourtCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sport: str = Field(examples=["padel", "tennis"])
    surface: str = Field(default="Hard")
    indoor: bool = False
    image_url: Optional[str] = None
    # Optional per-court hourly rate override (cents). Null = use the sport rate.
    hourly_rate_cents: Optional[int] = Field(default=None, ge=0, le=1_000_00)


class CourtUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    surface: Optional[str] = None
    indoor: Optional[bool] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    hourly_rate_cents: Optional[int] = Field(default=None, ge=0, le=1_000_00)


class CourtOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sport: str
    surface: str
    indoor: bool
    image_url: Optional[str]
    hourly_rate_cents: Optional[int] = None
    is_active: bool


# --------------------------------------------------------------------------- #
#  Availability & bookings                                                      #
# --------------------------------------------------------------------------- #
class AvailabilitySlot(BaseModel):
    court_id: uuid.UUID
    court_name: str
    sport: str
    surface: str
    indoor: bool
    image_url: Optional[str]
    start_time: datetime
    end_time: datetime
    duration_mins: int
    is_peak: bool
    price_cents: int
    price: float
    available: bool


class BookingCreate(BaseModel):
    court_id: uuid.UUID
    start_time: datetime
    duration_mins: int = Field(default=90, gt=0, le=8 * 60)
    title: Optional[str] = None
    # How many people the fee is split across (defaults to the sport's max).
    split_count: Optional[int] = Field(default=None, ge=1, le=8)
    invite_member_ids: List[uuid.UUID] = Field(default_factory=list)


class LedgerEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    member_id: uuid.UUID
    amount_cents: int
    amount: float
    currency: str
    status: str
    description: str
    created_at: datetime


class BookingOut(BaseModel):
    id: uuid.UUID
    court_id: uuid.UUID
    court_name: str
    club_name: str
    sport: str
    title: str
    start_time: datetime
    end_time: datetime
    duration_mins: int
    status: str
    source: str
    is_peak: bool
    total_fee_cents: int
    total_fee: float
    currency: str
    per_person_cents: int
    per_person: float
    match_id: Optional[uuid.UUID] = None
    ledger: List[LedgerEntryOut] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
#  Matchmaking                                                                  #
# --------------------------------------------------------------------------- #
class MatchRequestCreate(BaseModel):
    sport: str = Field(examples=["padel", "tennis"])
    earliest_start: datetime
    latest_start: datetime
    duration_mins: int = Field(default=90, gt=0, le=8 * 60)
    skill_level: Optional[str] = None  # defaults to the member's own level
    court_id: Optional[uuid.UUID] = None


class HostMatchCreate(BaseModel):
    sport: str = Field(examples=["padel", "tennis"])
    start_time: datetime
    duration_mins: int = Field(default=90, gt=0, le=8 * 60)
    court_id: Optional[uuid.UUID] = None
    skill_level: Optional[str] = None
    title: Optional[str] = None


class MatchOut(BaseModel):
    id: uuid.UUID
    sport: str
    title: str
    club_name: str
    court_name: Optional[str]
    skill_level: str
    start_time: datetime
    end_time: datetime
    duration_mins: int
    status: str
    min_players: int
    max_players: int
    spots_total: int
    spots_filled: int
    spots_left: int
    price_per_person_cents: Optional[int]
    price_per_person: Optional[float]
    host_name: Optional[str]
    players: List[PlayerOut]
    booking_id: Optional[uuid.UUID] = None
    created_at: datetime


class MatchRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sport: str
    skill_level: str
    earliest_start: datetime
    latest_start: datetime
    duration_mins: int
    status: str
    court_id: Optional[uuid.UUID]
    match_id: Optional[uuid.UUID]
    created_at: datetime


class MatchRequestResult(BaseModel):
    """What posting a request returns: the request plus any match it landed in."""

    request: MatchRequestOut
    match: Optional[MatchOut] = None
    confirmed: bool = False


class GameOut(BaseModel):
    """Unified "my games" row spanning matches and direct court bookings."""

    id: uuid.UUID
    kind: str  # match | court
    role: str  # host | joined | booked
    sport: str
    title: str
    club_name: str
    court_name: Optional[str]
    start_time: datetime
    end_time: datetime
    duration_mins: int
    status: str  # confirmed | filling | cancelled
    spots_total: int
    spots_filled: int
    price_per_person_cents: Optional[int]
    price_per_person: Optional[float]
    players: List[PlayerOut]
    booking_id: Optional[uuid.UUID] = None
    match_id: Optional[uuid.UUID] = None


# --------------------------------------------------------------------------- #
#  Notifications                                                                #
# --------------------------------------------------------------------------- #
class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    data: Dict[str, Any]
    read_at: Optional[datetime]
    created_at: datetime


class NotificationList(BaseModel):
    items: List[NotificationOut]
    unread: int


# --------------------------------------------------------------------------- #
#  Recurring reservations (admin court holds)                                   #
# --------------------------------------------------------------------------- #
class ReservationCreate(BaseModel):
    court_id: uuid.UUID
    title: str = Field(default="Court hold", min_length=1, max_length=120)
    weekday: int = Field(ge=0, le=6, description="0=Mon … 6=Sun")
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", examples=["18:00"])
    duration_mins: int = Field(ge=15, le=300, default=90)
    weeks: int = Field(ge=1, le=26, default=12, description="How many weeks to materialise")


class ReservationOut(BaseModel):
    id: uuid.UUID
    court_id: uuid.UUID
    court_name: str
    title: str
    weekday: int
    start_time: str  # "HH:MM"
    duration_mins: int
    active: bool
    upcoming: int  # future hold bookings still on the calendar


class ReservationCreateResult(BaseModel):
    reservation: ReservationOut
    created: int
    skipped: int


# --------------------------------------------------------------------------- #
#  Member directory (admin)                                                     #
# --------------------------------------------------------------------------- #
class MemberDirectoryOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    skill_level: str
    initials: str
    tone: str
    created_at: datetime


TokenResponse.model_rebuild()
