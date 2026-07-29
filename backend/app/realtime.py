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

    async def broadcast_club(self, club_id: str, payload: Dict[str, Any]) -> None:
        """Best-effort push to every connected member of a club — used for live
        match-fill updates so anyone viewing the feed sees a match fill in
        real time."""
        members = self._conns.get(club_id, {})
        for member_id, sockets in list(members.items()):
            for ws in list(sockets):
                try:
                    await ws.send_json(payload)
                except Exception:  # pragma: no cover
                    await self.disconnect(ws, club_id, member_id)


hub = NotificationHub()


def match_update_payload(
    match_id: str, spots_filled: int, spots_total: int, min_players: int, status: str
) -> Dict[str, Any]:
    return {
        "kind": "match_update",
        "match_id": match_id,
        "spots_filled": spots_filled,
        "spots_total": spots_total,
        "min_players": min_players,
        "status": status,
    }
