"""The critical consistency test: concurrent attempts on the same court+slot
must yield exactly ONE booking. Runs against a real Postgres so the GiST
exclusion constraint and row locking are genuinely exercised.
"""
import asyncio

from tests.helpers import add_member, auth, create_court, future, register_club


async def test_no_double_booking_under_concurrency(client):
    club = await register_club(client, "racket")
    admin = club["access_token"]
    court = await create_court(client, admin, "Court 1", "padel")

    # Eight members all lunge for the exact same slot at once.
    tokens = [admin]
    for i in range(7):
        m = await add_member(client, "racket", f"Player {i}", f"p{i}@racket.test")
        tokens.append(m["access_token"])

    payload = {"court_id": court["id"], "start_time": future(), "duration_mins": 90}

    async def book(token):
        return await client.post("/v1/bookings", headers=auth(token), json=payload)

    results = await asyncio.gather(*[book(t) for t in tokens])
    codes = sorted(r.status_code for r in results)

    assert codes.count(201) == 1, f"expected exactly one winner, got {codes}"
    assert codes.count(409) == len(tokens) - 1, f"expected the rest to 409, got {codes}"

    # The loser responses are structured 409s, not bare errors.
    for r in results:
        if r.status_code == 409:
            assert r.json()["error"]["code"] == "conflict"

    # And the database holds exactly one confirmed booking for that slot.
    listing = await client.get("/v1/bookings?scope=club", headers=auth(admin))
    assert listing.status_code == 200
    confirmed = [b for b in listing.json() if b["status"] == "confirmed"]
    assert len(confirmed) == 1


async def test_adjacent_slots_do_not_conflict(client):
    """Non-overlapping slots on the same court both succeed."""
    club = await register_club(client, "adjacent")
    admin = club["access_token"]
    court = await create_court(client, admin, "Court 1", "tennis")

    first = await client.post(
        "/v1/bookings",
        headers=auth(admin),
        json={"court_id": court["id"], "start_time": future(hour=10), "duration_mins": 60},
    )
    second = await client.post(
        "/v1/bookings",
        headers=auth(admin),
        json={"court_id": court["id"], "start_time": future(hour=11), "duration_mins": 60},
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
