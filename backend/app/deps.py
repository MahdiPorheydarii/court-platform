"""Request dependencies: database session, tenant resolution, and auth.

Tenant isolation model
----------------------
An access token carries the member's ``club_id``. Every authenticated request
derives its tenant *from the token*, and every query filters by that club id.
There is no request parameter a caller can set to read another club's data — a
Riverside token can only ever see Riverside rows. Host/subdomain resolution is
offered as a convenience for public (pre-login) pages only.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_session
from .errors import AuthError, ForbiddenError
from .models import Club, Member
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    member: Member
    club: Club


async def get_db() -> AsyncSession:  # pragma: no cover - passthrough
    async for session in get_session():
        yield session


async def resolve_club_by_host(session: AsyncSession, host: Optional[str]) -> Optional[Club]:
    """Best-effort hostname -> club resolution for public pages.

    ``riverside.acepair.app`` -> slug ``riverside``. A bare/unknown host returns
    None; callers fall back to an explicit slug.
    """
    if not host:
        return None
    hostname = host.split(":")[0].strip().lower()
    label = hostname.split(".")[0]
    if not label:
        return None
    res = await session.execute(
        select(Club).where(func.lower(Club.slug) == label)
    )
    return res.scalars().first()


async def get_club_by_slug(session: AsyncSession, slug: str) -> Optional[Club]:
    res = await session.execute(select(Club).where(func.lower(Club.slug) == slug.lower()))
    return res.scalars().first()


async def get_auth_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> AuthContext:
    if credentials is None or not credentials.credentials:
        raise AuthError("Authentication required.")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise AuthError("Invalid or expired token.")

    sub = payload.get("sub")
    club_id = payload.get("club_id")
    if not sub or not club_id:
        raise AuthError("Malformed token.")

    try:
        member = await session.get(Member, uuid.UUID(sub))
    except (ValueError, TypeError):
        raise AuthError("Malformed token.")

    if member is None or str(member.club_id) != str(club_id):
        raise AuthError("Account not found for this token.")

    club = await session.get(Club, member.club_id)
    if club is None:
        raise AuthError("Club not found.")
    return AuthContext(member=member, club=club)


async def require_admin(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if ctx.member.role != "admin":
        raise ForbiddenError("This action requires club admin privileges.")
    return ctx
