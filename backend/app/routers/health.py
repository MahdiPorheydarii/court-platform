"""Liveness / readiness endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db
from ..state import STARTUP

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict:
    body = {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "db_ready": STARTUP["db_ready"],
    }
    if STARTUP["error"]:
        body["startup_error"] = STARTUP["error"][:600]
    return body


@router.get("/v1/health", summary="Readiness probe (checks the database)")
async def readiness(session: AsyncSession = Depends(get_db)) -> dict:
    await session.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
