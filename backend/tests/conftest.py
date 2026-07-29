"""Pytest fixtures for database-backed tests.

A **real** Postgres is used (never a mock) because the booking-conflict test
depends on the actual GiST exclusion constraint and row-level locking. By
default we spin an ephemeral container via testcontainers; set
``TEST_DATABASE_URL`` to point at your own Postgres instead.
"""
from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Must be set before importing the app so settings pick them up.
os.environ.setdefault("SEED_DEMO_DATA", "false")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.database import Base  # noqa: E402
from app.deps import get_db  # noqa: E402
from app.main import app  # noqa: E402

_CONTAINER = None


def _resolve_database_url() -> str:
    env = os.getenv("TEST_DATABASE_URL")
    if env:
        return env
    from testcontainers.postgres import PostgresContainer

    global _CONTAINER
    _CONTAINER = PostgresContainer("postgres:16-alpine")
    _CONTAINER.start()
    host = _CONTAINER.get_container_host_ip()
    port = _CONTAINER.get_exposed_port(5432)
    return (
        f"postgresql+asyncpg://{_CONTAINER.username}:{_CONTAINER.password}"
        f"@{host}:{port}/{_CONTAINER.dbname}"
    )


@pytest.fixture(scope="session")
def database_url() -> str:
    url = _resolve_database_url()
    try:
        yield url
    finally:
        if _CONTAINER is not None:
            _CONTAINER.stop()


@pytest_asyncio.fixture
async def engine(database_url):
    eng = create_async_engine(database_url, pool_size=20, max_overflow=10)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def client(engine):
    TestSession = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
