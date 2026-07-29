"""In-process background sweeper for matchmaking maintenance.

Runs a light periodic task (default every 20s) that regroups waiting requests,
expires stale ones, and resolves under-filled matches. For a single app
container this is exactly enough; heavier scale would move this to a dedicated
worker (arq/Celery) — the ``sweep`` function it calls is agnostic to how it's
scheduled.
"""
from __future__ import annotations

import asyncio
import logging

from .config import settings
from .database import SessionLocal
from .services.matchmaking import sweep

logger = logging.getLogger("acepair.scheduler")


class Sweeper:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def _loop(self) -> None:
        logger.info("matchmaking sweeper started (every %ss)", settings.matchmaking_sweep_seconds)
        while not self._stop.is_set():
            try:
                async with SessionLocal() as session:
                    stats = await sweep(
                        session, request_ttl_minutes=settings.match_request_ttl_minutes
                    )
                if any(stats.values()):
                    logger.info("sweep results: %s", stats)
            except Exception:  # pragma: no cover - defensive; never kill the loop
                logger.exception("matchmaking sweep failed")
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=settings.matchmaking_sweep_seconds
                )
            except asyncio.TimeoutError:
                pass

    def start(self) -> None:
        if self._task is None:
            self._stop.clear()
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
            self._task = None


sweeper = Sweeper()
