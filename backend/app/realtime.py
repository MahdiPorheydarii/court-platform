"""In-process WebSocket hub for live notifications.

Members open a socket at ``/v1/ws/notifications`` and receive booking
confirmations, match fills, and cancellations the instant they happen — no
polling, so the UI feels alive.

Scope note: this hub is per-process. For a single Dokploy app container it's
exactly right. To scale horizontally you'd back ``publish`` with Redis pub/sub
(or NATS) and fan out to each process; the ``NotificationHub`` interface is the
seam where that swap happens.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Set


class NotificationHub:
    def __init__(self) -> None:
        # club_id -> member_id -> set of live sockets
        self._conns: DefaultDict[str, DefaultDict[str, Set[Any]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any, club_id: str, member_id: str) -> None:
        async with self._lock:
            self._conns[club_id][member_id].add(websocket)

    async def disconnect(self, websocket: Any, club_id: str, member_id: str) -> None:
        async with self._lock:
            members = self._conns.get(club_id)
            if not members:
                return
            sockets = members.get(member_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                members.pop(member_id, None)
            if not members:
                self._conns.pop(club_id, None)

    async def publish(self, club_id: str, member_id: str, payload: Dict[str, Any]) -> None:
        """Best-effort push to one member's live sockets (never raises)."""
        sockets = list(self._conns.get(club_id, {}).get(member_id, set()))
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:  # pragma: no cover - socket died mid-send
                await self.disconnect(ws, club_id, member_id)


hub = NotificationHub()
