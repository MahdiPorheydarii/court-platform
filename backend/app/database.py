"""Async SQLAlchemy engine, session factory, and declarative base.

We rely on PostgreSQL-specific features (the ``btree_gist`` extension plus a
GiST exclusion constraint on bookings) so the "no double booking" guarantee is
enforced by the database itself, not by application-level locking that could be
raced. The extension is created before any table via a metadata event hook so
that both the running app and the test suite get an identical schema.
"""
from __future__ import annotations

from sqlalchemy import DDL, event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


# Ensure the extension exists before CREATE TABLE emits the exclusion constraint.
event.listen(
    Base.metadata,
    "before_create",
    DDL("CREATE EXTENSION IF NOT EXISTS btree_gist"),
)


def make_engine(url: str | None = None):
    return create_async_engine(
        url or settings.database_url,
        echo=False,
        pool_pre_ping=True,
        # A generous pool so concurrent booking attempts genuinely race at the
        # database rather than serialising behind a single connection.
        pool_size=20,
        max_overflow=10,
    )


engine = make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncSession:  # pragma: no cover - trivial dependency
    """FastAPI dependency yielding a request-scoped session."""
    async with SessionLocal() as session:
        yield session


async def init_models() -> None:
    """Create all tables (and the extension) if they do not yet exist."""
    # Import models so they are registered on the metadata before create_all.
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
