"""End-to-end matchmaking: two compatible requests auto-confirm into a match,
spawn a booking, and produce a reconciled fee split.
"""
from tests.helpers import add_member, auth, create_court, future, register_club


async def test_requests_group_and_confirm_with_fee_split(client):
    club = await register_club(client, "netters")
    admin = club["access_token"]
    await create_court(client, admin, "Clay 1", "tennis")

    m1 = await add_member(client, "netters", "Ana One", "ana@netters.test", "Intermediate")
    m2 = await add_member(client, "netters", "Ben Two", "ben@netters.test", "Intermediate")

    req_body = {
        "sport": "tennis",
        "earliest_start": future(hour=10),
        "latest_start": future(hour=12),
        "duration_mins": 60,
    }

    # First request has nobody to pair with yet -> stays open, no match.
    r1 = await client.post("/v1/match-requests", headers=auth(m1["access_token"]), json=req_body)
    assert r1.status_code == 201, r1.text
    assert r1.json()["match"] is None
    assert r1.json()["confirmed"] is False

    # Second compatible request completes the pair -> tennis min is 2 -> confirmed.
    r2 = await client.post("/v1/match-requests", headers=auth(m2["access_token"]), json=req_body)
    assert r2.status_code == 201, r2.text
    body = r2.json()
    assert body["match"] is not None
    assert body["confirmed"] is True

    match = body["match"]
    assert match["status"] == "confirmed"
    assert match["spots_filled"] == 2
    assert match["booking_id"] is not None
    assert match["price_per_person_cents"] is not None

    # The fee split reconciles to the exact total, one entry per player.
    fees = await client.get(
        f"/v1/bookings/{match['booking_id']}/fees", headers=auth(m1["access_token"])
    )
    assert fees.status_code == 200
    fee_body = fees.json()
    entries = fee_body["entries"]
    assert len(entries) == 2
    assert sum(e["amount_cents"] for e in entries) == fee_body["total_fee_cents"]


async def test_host_and_join_flow_confirms(client):
    club = await register_club(client, "smashers")
    admin = club["access_token"]
    court = await create_court(client, admin, "Glass 1", "padel")

    # Host a padel match (min 4 by default).
    hosted = await client.post(
        "/v1/matches",
        headers=auth(admin),
        json={"sport": "padel", "start_time": future(hour=18), "court_id": court["id"]},
    )
    assert hosted.status_code == 201, hosted.text
    match_id = hosted.json()["id"]
    assert hosted.json()["status"] == "open"
    assert hosted.json()["spots_filled"] == 1

    # Three more members join; the 4th body fills the quorum and it confirms.
    tokens = []
    for i in range(3):
        m = await add_member(client, "smashers", f"Pad {i}", f"pad{i}@smashers.test")
        tokens.append(m["access_token"])

    last_status = None
    for t in tokens:
        r = await client.post(f"/v1/matches/{match_id}/join", headers=auth(t))
        assert r.status_code == 200, r.text
        last_status = r.json()["status"]

    assert last_status == "confirmed"

    detail = await client.get(f"/v1/matches/{match_id}", headers=auth(admin))
    assert detail.json()["spots_filled"] == 4
    assert detail.json()["booking_id"] is not None
