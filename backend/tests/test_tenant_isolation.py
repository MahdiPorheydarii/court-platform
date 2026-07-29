"""Cross-tenant isolation: a token for club B must never touch club A's data."""
from tests.helpers import auth, create_court, future, register_club


async def test_token_cannot_read_or_write_another_clubs_data(client):
    alpha = await register_club(client, "alpha", admin_email="a@alpha.test")
    beta = await register_club(client, "beta", admin_email="b@beta.test")
    a_token = alpha["access_token"]
    b_token = beta["access_token"]

    # Alpha sets up a court and books it.
    a_court = await create_court(client, a_token, "Center Court", "padel")
    a_booking = await client.post(
        "/v1/bookings",
        headers=auth(a_token),
        json={"court_id": a_court["id"], "start_time": future(), "duration_mins": 90},
    )
    assert a_booking.status_code == 201
    a_booking_id = a_booking.json()["id"]

    # Alpha hosts a match.
    a_match = await client.post(
        "/v1/matches",
        headers=auth(a_token),
        json={"sport": "padel", "start_time": future(hour=14), "court_id": a_court["id"]},
    )
    assert a_match.status_code == 201
    a_match_id = a_match.json()["id"]

    # --- Beta must see none of it ---
    # 1) Beta's court list is empty (does not include Alpha's court).
    b_courts = await client.get("/v1/courts", headers=auth(b_token))
    assert b_courts.status_code == 200
    assert b_courts.json() == []

    # 2) Beta cannot book Alpha's court (scoped lookup -> not found).
    steal = await client.post(
        "/v1/bookings",
        headers=auth(b_token),
        json={"court_id": a_court["id"], "start_time": future(hour=16), "duration_mins": 90},
    )
    assert steal.status_code == 404

    # 3) Beta cannot read Alpha's booking.
    read_booking = await client.get(f"/v1/bookings/{a_booking_id}", headers=auth(b_token))
    assert read_booking.status_code == 404

    # 4) Beta cannot read Alpha's match.
    read_match = await client.get(f"/v1/matches/{a_match_id}", headers=auth(b_token))
    assert read_match.status_code == 404

    # 5) Beta's match discovery returns nothing.
    b_matches = await client.get("/v1/matches?status=all", headers=auth(b_token))
    assert b_matches.status_code == 200
    assert b_matches.json() == []


async def test_unauthenticated_requests_are_rejected(client):
    r = await client.get("/v1/courts")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_member_cannot_use_admin_only_endpoints(client):
    club = await register_club(client, "roles")
    # A plain member signs up.
    from tests.helpers import add_member

    member = await add_member(client, "roles", "Reg Ular", "reg@roles.test")
    r = await client.post(
        "/v1/courts",
        headers=auth(member["access_token"]),
        json={"name": "Sneaky Court", "sport": "padel"},
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
