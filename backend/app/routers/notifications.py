"""Notifications: list, mark read, and a live WebSocket stream."""
from __future__ import annotations

import uuid

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import SessionLocal
from ..deps import AuthContext, get_auth_context, get_db
from ..errors import NotFoundError
from ..models import Member, Notification
from ..realtime import hub
from ..schemas import NotificationList, NotificationOut
from ..security import decode_access_token

router = APIRouter(prefix="/v1", tags=["notifications"])


@router.get("/notifications", response_model=NotificationList, summary="List notifications")
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> NotificationList:
    stmt = select(Notification).where(
        Notification.club_id == ctx.club.id,
        Notification.member_id == ctx.member.id,
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(min(limit, 100))
    rows = (await session.execute(stmt)).scalars().all()

    unread = (
        await session.execute(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.club_id == ctx.club.id,
                Notification.member_id == ctx.member.id,
                Notification.read_at.is_(None),
            )
        )
    ).scalar_one()
    return NotificationList(
        items=[NotificationOut.model_validate(n) for n in rows], unread=unread
    )


@router.post("/notifications/{notification_id}/read", summary="Mark one as read")
async def mark_read(
    notification_id: uuid.UUID,
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    note = await session.get(Notification, notification_id)
    if note is None or note.club_id != ctx.club.id or note.member_id != ctx.member.id:
        raise NotFoundError("Notification not found.")
    if note.read_at is None:
        note.read_at = func.now()
    await session.commit()
    return {"ok": True}


@router.post("/notifications/read-all", summary="Mark all as read")
async def mark_all_read(
    ctx: AuthContext = Depends(get_auth_context),
    session: AsyncSession = Depends(get_db),
) -> dict:
    await session.execute(
        update(Notification)
        .where(
            Notification.club_id == ctx.club.id,
            Notification.member_id == ctx.member.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    await session.commit()
    return {"ok": True}


@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket) -> None:
    """Live notification stream.

    Browsers can't set Authorization headers on a WebSocket, so the access
    token is passed as a ``?token=`` query parameter.
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_access_token(token)
        member_id = payload["sub"]
        club_id = payload["club_id"]
    except (jwt.PyJWTError, KeyError):
        await websocket.close(code=4401)
        return

    # Validate the member still exists / belongs to the club.
    async with SessionLocal() as session:
        member = await session.get(Member, uuid.UUID(member_id))
        if member is None or str(member.club_id) != str(club_id):
            await websocket.close(code=4401)
            return

    await websocket.accept()
    await hub.connect(websocket, club_id, member_id)
    try:
        await websocket.send_json({"kind": "connected"})
        while True:
            # We don't need inbound messages; this keeps the socket open and
            # detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(websocket, club_id, member_id)
