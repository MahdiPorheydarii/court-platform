"""SQLAlchemy ORM models for AcePair.

Design notes
------------
* Every tenant-scoped table carries ``club_id``. All queries are filtered by it
  (see ``app.deps``) so one club can never read another's rows.
* Primary keys are UUIDs — non-enumerable, so an attacker can't walk IDs to
  probe another tenant's data.
* Money is stored in integer **cents** everywhere. No floats touch a ledger.
* ``bookings`` carries a GiST exclusion constraint: two confirmed bookings for
  the same court whose ``[start, end)`` ranges overlap cannot coexist. This is
  the database-level guarantee against double-booking.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


UUIDpk = UUID(as_uuid=True)


# --------------------------------------------------------------------------- #
#  Constants (kept as plain strings rather than PG enums to avoid migration    #
#  friction when a new state is added).                                        #
# --------------------------------------------------------------------------- #
class Role:
    MEMBER = "member"
    ADMIN = "admin"


class BookingStatus:
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class BookingSource:
    DIRECT = "direct"
    MATCH = "match"


class MatchStatus:
    OPEN = "open"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class RequestStatus:
    OPEN = "open"
    MATCHED = "matched"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class LedgerStatus:
    OWED = "owed"
    PAID = "paid"
    WAIVED = "waived"
    REFUNDED = "refunded"


# --------------------------------------------------------------------------- #
#  Tenant root                                                                 #
# --------------------------------------------------------------------------- #
class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Hostname label used to resolve a request to a tenant (subdomain / path).
    slug: Mapped[str] = mapped_column(String(63), nullable=False, unique=True, index=True)
    # Free-form, data-driven behaviour config (fees, peak windows, policies…).
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (UniqueConstraint("club_id", "email", name="uq_member_email_per_club"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=Role.MEMBER)
    skill_level: Mapped[str] = mapped_column(String(20), nullable=False, default="Intermediate")
    # Tailwind token pair for the avatar chip so the UI stays consistent.
    tone: Mapped[str] = mapped_column(String(60), default="bg-primary/15 text-primary")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Court(Base):
    __tablename__ = "courts"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sport: Mapped[str] = mapped_column(String(20), nullable=False)  # tennis | padel
    surface: Mapped[str] = mapped_column(String(60), default="Hard")
    indoor: Mapped[bool] = mapped_column(Boolean, default=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Optional per-court hourly rate override (cents). Falls back to the club's
    # per-sport base rate when null — so pricing is per-sport by default but a
    # premium (indoor / panoramic) court can charge more.
    hourly_rate_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        # The heart of the double-booking guarantee. Two rows for the same court
        # whose [start_time, end_time) ranges overlap cannot both exist unless
        # one is cancelled.
        ExcludeConstraint(
            ("court_id", "="),
            (text("tstzrange(start_time, end_time, '[)')"), "&&"),
            using="gist",
            where=text("status <> 'cancelled'"),
            name="no_overlapping_bookings",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    court_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    host_member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    match_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("matches.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(120), default="Court booking")
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=BookingStatus.CONFIRMED)
    source: Mapped[str] = mapped_column(String(20), default=BookingSource.DIRECT)
    total_fee_cents: Mapped[int] = mapped_column(Integer, default=0)
    # How many ways the fee was split (for a faithful "per person" quote).
    split_count: Mapped[int] = mapped_column(Integer, default=1)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    is_peak: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Match(Base):
    """A group of players forming around a shared time/sport/skill window.

    Persists as ``open`` while it fills; auto-``confirmed`` (spawning a booking
    and a fee split) when it reaches the club's minimum player count.
    """

    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    court_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("courts.id", ondelete="SET NULL"), nullable=True
    )
    booking_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    host_member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(120), default="Open match")
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    skill_level: Mapped[str] = mapped_column(String(20), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    min_players: Mapped[int] = mapped_column(Integer, nullable=False)
    max_players: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=MatchStatus.OPEN)
    price_per_person_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    participants: Mapped[List["MatchParticipant"]] = relationship(
        back_populates="match", lazy="selectin", cascade="all, delete-orphan"
    )


class MatchParticipant(Base):
    __tablename__ = "match_participants"
    __table_args__ = (
        UniqueConstraint("match_id", "member_id", name="uq_participant_per_match"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("match_requests.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[str] = mapped_column(String(20), default="player")  # host | player
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    match: Mapped["Match"] = relationship(back_populates="participants")


class MatchRequest(Base):
    """A member's "looking for players" post."""

    __tablename__ = "match_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    court_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("courts.id", ondelete="SET NULL"), nullable=True
    )
    match_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("matches.id", ondelete="SET NULL"), nullable=True
    )
    sport: Mapped[str] = mapped_column(String(20), nullable=False)
    skill_level: Mapped[str] = mapped_column(String(20), nullable=False)
    earliest_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    latest_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=RequestStatus.OPEN)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class LedgerEntry(Base):
    """Immutable, auditable record of how a booking's fee was divided.

    One row per player per booking. Rows are never mutated in place for money
    changes; a refund is a new offsetting row so the trail is complete.
    """

    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    match_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("matches.id", ondelete="SET NULL"), nullable=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    status: Mapped[str] = mapped_column(String(20), default=LedgerStatus.OWED)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUIDpk, primary_key=True, default=_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
