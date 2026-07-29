"""AcePair API — FastAPI application assembly.

Wires routers, CORS, structured error handling, the background sweeper, and
(optionally) demo-data seeding so a fresh deploy is never an empty shell.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import settings
from .database import init_models
from .errors import AppError
from .state import STARTUP
from .routers import (
    auth,
    availability,
    bookings,
    clubs,
    courts,
    games,
    health,
    matches,
    notifications,
)
from .scheduler import sweeper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("acepair")


TAGS_METADATA = [
    {"name": "health", "description": "Liveness and readiness probes."},
    {"name": "auth", "description": "Club onboarding, member signup, and login."},
    {"name": "clubs", "description": "Per-tenant profile and data-driven config."},
    {"name": "courts", "description": "Court setup and listing."},
    {"name": "availability", "description": "Bookable slots with live free/taken status."},
    {"name": "bookings", "description": "Court bookings, fee ledgers, and cancellations."},
    {"name": "matchmaking", "description": "Open matches, requests, joining, and leaving."},
    {"name": "games", "description": "A member's unified upcoming/past schedule."},
    {"name": "notifications", "description": "Notification feed and live WebSocket stream."},
]

DESCRIPTION = """
**AcePair** is a multi-tenant platform for tennis & padel clubs: members book
courts, post "looking for players" requests, get auto-matched into full games,
and split court fees.

* Every request is scoped to one club via the access token — no cross-tenant leakage.
* Bookings are protected against double-booking by a database exclusion constraint.
* Matches auto-confirm when they hit the club's minimum player count.
"""


def _guard_jwt_secret() -> None:
    """Never run a non-dev deploy with a guessable token-signing secret.

    Rather than crash-looping a deploy that forgot to set JWT_SECRET, we mint a
    strong random one for this process and warn loudly. Tokens then won't
    survive a restart — the fix is to set a real, long JWT_SECRET.
    """
    if settings.environment == "development":
        return
    if len(settings.jwt_secret) < 24:  # too short/unset to be safe
        import secrets

        settings.jwt_secret = secrets.token_urlsafe(48)
        logger.warning(
            "JWT_SECRET was unset or too short; generated a random per-process secret. "
            "Set a strong, stable JWT_SECRET so tokens survive restarts."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _guard_jwt_secret()
    # Initialise the schema. If it fails, don't crash-loop silently — start in a
    # degraded mode and surface the exact reason via /health so it's debuggable.
    try:
        await init_models()
        STARTUP["db_ready"] = True
    except Exception as exc:
        import traceback

        STARTUP["error"] = f"{type(exc).__name__}: {exc}"
        logger.error("init_models failed — starting degraded:\n%s", traceback.format_exc())

    if STARTUP["db_ready"] and settings.seed_demo_data:
        try:
            from .seed import seed_demo

            await seed_demo()
        except Exception:  # pragma: no cover - seeding is best-effort
            logger.exception("demo seeding failed (continuing)")

    if STARTUP["db_ready"]:
        sweeper.start()
    try:
        yield
    finally:
        await sweeper.stop()


app = FastAPI(
    title="AcePair API",
    version=__version__,
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex_value,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
#  Structured error handling — the frontend never sees a bare stack trace.     #
# --------------------------------------------------------------------------- #
def _error_body(code: str, message: str, details=None) -> dict:
    body = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return body


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.code, exc.message, exc.details),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=_error_body(
            "validation_error",
            "Some fields are invalid.",
            details={"errors": exc.errors()},
        ),
    )


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):  # pragma: no cover
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=_error_body("internal_error", "Something went wrong on our end."),
    )


for module in (
    health,
    auth,
    clubs,
    courts,
    availability,
    bookings,
    matches,
    games,
    notifications,
):
    app.include_router(module.router)


@app.get("/", tags=["health"], summary="Service banner")
async def root() -> dict:
    return {
        "app": settings.app_name,
        "version": __version__,
        "docs": "/docs",
        "health": "/health",
    }
