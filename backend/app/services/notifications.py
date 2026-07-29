"""Notification delivery.

Every notification is persisted (so it survives reconnects and powers the bell
menu) and simultaneously pushed over the WebSocket hub for a live feel.

The channel is pluggable: ``_CHANNELS`` currently holds a stored+realtime
channel. Swapping in real email/push later means adding a channel here — no
caller changes.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Notification
from ..realtime import hub


async def notify(
    session: AsyncSession,
    *,
    club_id: uuid.UUID,
    member_id: uuid.UUID,
    type: str,
    title: str,
    body: str = "",
    data: Optional[Dict[str, Any]] = None,
) -> Notification:
    """Create a notification row and push it live. Caller commits the session."""
    note = Notification(
        club_id=club_id,
        member_id=member_id,
        type=type,
        title=title,
        body=body,
        data=data or {},
    )
    session.add(note)
    await session.flush()

    payload = {
        "kind": "notification",
        "id": str(note.id),
        "type": type,
        "title": title,
        "body": body,
        "data": note.data,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }
    # Fire-and-forget realtime push; never let a dead socket break the request.
    try:
        await hub.publish(str(club_id), str(member_id), payload)
    except Exception:  # pragma: no cover
        pass
    return note


async def notify_many(
    session: AsyncSession,
    *,
    club_id: uuid.UUID,
    member_ids: Iterable[uuid.UUID],
    type: str,
    title: str,
    body: str = "",
    data: Optional[Dict[str, Any]] = None,
) -> List[Notification]:
    notes = []
    for mid in member_ids:
        notes.append(
            await notify(
                session,
                club_id=club_id,
                member_id=mid,
                type=type,
                title=title,
                body=body,
                data=data,
            )
        )
    return notes
