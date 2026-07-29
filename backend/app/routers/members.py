"""Club member directory (admin)."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import AuthContext, get_db, require_admin
from ..models import Member
from ..schemas import MemberDirectoryOut

router = APIRouter(prefix="/v1", tags=["members"])


@router.get("/members", response_model=List[MemberDirectoryOut], summary="Club member directory (admin)")
async def list_members(
    ctx: AuthContext = Depends(require_admin), session: AsyncSession = Depends(get_db)
) -> List[MemberDirectoryOut]:
    rows = (
        await session.execute(
            select(Member).where(Member.club_id == ctx.club.id).order_by(Member.created_at)
        )
    ).scalars().all()
    out: List[MemberDirectoryOut] = []
    for m in rows:
        initials = "".join(p[0] for p in m.name.split()[:2]).upper() or "?"
        out.append(
            MemberDirectoryOut(
                id=m.id,
                name=m.name,
                email=m.email,
                role=m.role,
                skill_level=m.skill_level,
                initials=initials,
                tone=m.tone,
                created_at=m.created_at,
            )
        )
    return out
