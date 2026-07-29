"""Booking happy paths: fee ledger reconciliation, cancellation, and re-booking
a freed slot.
"""
from tests.helpers import auth, create_court, future, register_club


async def test_booking_ledger_sums_to_total(client):
    club = await register_club(client, "ledger")
    admin = club["access_token"]
    court = await create_court(client, admin, "Court 1", "padel")

    resp = await client.post(
        "/v1/bookings",
        headers=auth(admin),
        json={
            "court_id": court["id"],
            "start_time": future(hour=9),
            "duration_mins": 90,
            "split_count": 4,
        },
    )
    assert resp.status_code == 201, resp.text
    booking = resp.json()

    # Only the host is known, so shares fall to them but still sum to the total.
    assert booking["total_fee_cents"] > 0
    assert sum(e["amount_cents"] for e in booking["ledger"]) == booking["total_fee_cents"]

    fees = await client.get(f"/v1/bookings/{booking['id']}/fees", headers=auth(admin))
    assert fees.status_code == 200
    assert sum(e["amount_cents"] for e in fees.json()["entries"]) == booking["total_fee_cents"]


async def test_cancel_frees_the_slot_for_rebooking(client):
    club = await register_club(client, "cancel")
    admin = club["access_token"]
    court = await create_court(client, admin, "Court 1", "tennis")
    slot = {"court_id": court["id"], "start_time": future(hour=13), "duration_mins": 60}

    first = await client.post("/v1/bookings", headers=auth(admin), json=slot)
    assert first.status_code == 201
    booking_id = first.json()["id"]

    # Same slot is now blocked.
    blocked = await client.post("/v1/bookings", headers=auth(admin), json=slot)
    assert blocked.status_code == 409

    # Cancel, then the slot is bookable again (partial index excludes cancelled).
    cancelled = await client.delete(f"/v1/bookings/{booking_id}", headers=auth(admin))
    assert cancelled.status_code == 200
    assert cancelled.json()["cancelled"] is True

    rebooked = await client.post("/v1/bookings", headers=auth(admin), json=slot)
    assert rebooked.status_code == 201, rebooked.text


async def test_notifications_are_created_on_booking(client):
    club = await register_club(client, "notify")
    admin = club["access_token"]
    court = await create_court(client, admin, "Court 1", "padel")
    await client.post(
        "/v1/bookings",
        headers=auth(admin),
        json={"court_id": court["id"], "start_time": future(hour=8), "duration_mins": 90},
    )
    notes = await client.get("/v1/notifications", headers=auth(admin))
    assert notes.status_code == 200
    body = notes.json()
    assert body["unread"] >= 1
    assert any(n["type"] == "booking_confirmed" for n in body["items"])
