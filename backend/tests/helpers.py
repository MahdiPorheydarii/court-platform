"""Small async helpers shared by the API tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from httpx import AsyncClient


def auth(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def future(days: int = 2, hour: int = 10, minute: int = 0) -> str:
    dt = datetime.now(timezone.utc).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    ) + timedelta(days=days)
    return dt.isoformat()


async def register_club(
    client: AsyncClient, slug: str, *, admin_email: str = "admin@club.test"
) -> Dict[str, Any]:
    resp = await client.post(
        "/v1/clubs",
        json={
            "club_name": f"Club {slug}",
            "slug": slug,
            "admin_name": "Club Admin",
            "admin_email": admin_email,
            "admin_password": "password123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def add_member(
    client: AsyncClient, slug: str, name: str, email: str, level: str = "Intermediate"
) -> Dict[str, Any]:
    resp = await client.post(
        f"/v1/auth/register?slug={slug}",
        json={"name": name, "email": email, "password": "password123", "skill_level": level},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def create_court(
    client: AsyncClient, token: str, name: str, sport: str
) -> Dict[str, Any]:
    resp = await client.post(
        "/v1/courts",
        headers=auth(token),
        json={"name": name, "sport": sport, "surface": "Hard", "indoor": False},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
