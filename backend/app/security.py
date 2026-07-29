"""Password hashing (bcrypt) and JWT access tokens.

Kept deliberately small and dependency-light: ``bcrypt`` directly (no passlib
shim) and ``PyJWT``. Tokens carry the member id, their club id, and role, so a
token minted for one tenant can never authenticate against another.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from .config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    *, member_id: str, club_id: str, role: str, expires_minutes: Optional[int] = None
) -> str:
    now = datetime.now(timezone.utc)
    ttl = expires_minutes if expires_minutes is not None else settings.access_token_ttl_minutes
    payload: Dict[str, Any] = {
        "sub": member_id,
        "club_id": club_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode & verify a token. Raises ``jwt.PyJWTError`` on any problem."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
