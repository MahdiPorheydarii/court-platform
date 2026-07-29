# AcePair 🎾

**AcePair is a members club for tennis & padel, in software form.** Clubs onboard
their courts and rules; members find open games, get matched into full groups by
skill and time, book courts without ever double-booking, and split the court fee
automatically.

One deployed app serves *every* club (multi-tenant). Each club is walled off from
the others — a member of "Riverside" can never see "Hillcrest" data.

---

## What it does

| For members | For club admins |
|---|---|
| Discover open matches and available court slots | Register a club in one step |
| Post a "looking for players" request and get auto-matched | Add / retire courts (tennis & padel) |
| Join a game in one tap; the fee splits across players | Set pricing (base rate, peak multiplier) |
| Book a specific court + time, safely | Choose how many players confirm a match |
| Get live notifications when a match fills | Set the cancellation window & no-show policy |
| See everything upcoming in "My games" | All of it is data-driven — no code changes per club |

The product is designed to *feel alive*: bookings confirm instantly, matches fill
in real time, and notifications arrive over a live connection rather than a page
refresh.

---

## How it's built (the 5-minute tour)

```mermaid
flowchart LR
    U[Member's browser] -->|HTTPS| W[Web app<br/>Next.js]
    W -->|REST + WebSocket| A[API<br/>FastAPI]
    A -->|SQL| D[(PostgreSQL)]
    A -. background sweeper .-> A
    subgraph One deployment, many clubs
      A
      D
    end
```

Three pieces, all shipped together with Docker Compose:

1. **Web app** (`/frontend`) — a Next.js site. The visual layer members and admins
   use. Talks to the API over HTTPS.
2. **API** (`/backend`) — a FastAPI service. All the rules live here: booking,
   matchmaking, fees, notifications, tenant isolation.
3. **Database** — PostgreSQL. The single source of truth.

### Five decisions worth knowing about

- **No double-booking, guaranteed by the database.** Instead of hoping two
  requests don't collide, the database itself refuses to store two overlapping
  bookings for the same court (a Postgres *exclusion constraint*). If two people
  tap "book" at the same instant, exactly one wins and the other gets a clean
  "that slot was just taken" — never a silent double-booking. This is tested with
  8 simultaneous requests.

- **Matchmaking is instant, with a safety net.** When you post a request or join a
  game, AcePair tries to group and confirm you *right away*. A lightweight
  background job also sweeps every few seconds to pair up people who couldn't be
  matched at the moment and to tidy up games that never filled.

- **Money is auditable, never fuzzy.** Every fee is stored in whole cents, and each
  booking produces a **ledger** — one line per player showing exactly what they
  owe. The lines always add up to the total, to the penny. (Payments aren't
  processed yet; the structure is ready for a processor like Stripe to slot in.)

- **One login = one club.** A member's access token carries their club's identity.
  Every database query is filtered by it, so cross-club data leaks are structurally
  impossible, not just discouraged. There's an automated test that actively tries to
  break in and confirms it can't.

- **Kept deliberately simple to deploy.** Postgres + the app, nothing else. Live
  notifications use an in-process channel rather than adding Redis; the code is
  organized so Redis can be dropped in later for larger scale. Fewer moving parts =
  a more reliable deployment.

---

## Run it locally

You need Docker.

```bash
docker compose up --build
```

Then open:

- **Web app** → http://localhost:3000
- **API docs** (interactive) → http://localhost:8000/docs
- **API health** → http://localhost:8000/health

The API seeds a **demo club** on first boot so nothing is empty:

| Field | Value |
|---|---|
| Club address | `riverside` |
| Email | `alex@riverside.club` |
| Password | `acepair123` |

> By default the web app runs in **showcase mode** on built-in demo data so it
> always looks alive. To wire it to the live API, set `API_PUBLIC_URL` (see
> Deployment) and sign in with the demo account.

---

## Run the tests

The suite uses a **real** Postgres (via [testcontainers], spun up automatically) —
not mocks — because the booking-conflict test has to exercise real database
locking.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                     # needs Docker running (for the ephemeral Postgres)

# Or point at your own Postgres and skip the container:
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/acepair_test pytest
```

The fee-math and matchmaking-grouping tests are pure logic and need no database:

```bash
pytest tests/test_fee_split.py tests/test_matchmaking.py
```

**What's covered:** booking under concurrency (no double-booking), matchmaking
grouping rules, fee-split math, tenant isolation (an active break-in attempt),
plus end-to-end match confirmation and booking flows.

[testcontainers]: https://testcontainers.com/

---

## For the frontend team

- **Base URL:** whatever you set as `NEXT_PUBLIC_API_URL` (e.g.
  `https://api.acepair.app`). Leave it empty and the app happily runs on demo data.
- **Auth flow:** `POST /v1/auth/login` (or `POST /v1/clubs` to onboard) returns an
  `access_token`. Send it as `Authorization: Bearer <token>` on every call. The
  token already encodes the club, so you never pass a club id around.
- **Errors are structured** — always `{ "error": { "code", "message", "details" } }`,
  with sensible HTTP status codes (409 for a taken slot, 404 for not-found, 401/403
  for auth). No bare 500s with stack traces.
- **Live updates:** connect a WebSocket to `/v1/ws/notifications?token=<token>` to
  receive match fills, booking changes, and cancellations the instant they happen.

Key endpoints (full interactive list at `/docs`):

| Area | Endpoint |
|---|---|
| Onboard a club | `POST /v1/clubs` |
| Log in | `POST /v1/auth/login` |
| Discover matches | `GET /v1/matches?status=open` |
| Post a request | `POST /v1/match-requests` |
| Host / join / leave | `POST /v1/matches`, `/v1/matches/{id}/join`, `/leave` |
| Availability | `GET /v1/availability` |
| Book a court | `POST /v1/bookings` |
| Fee ledger | `GET /v1/bookings/{id}/fees` |
| My schedule | `GET /v1/me/games` |
| Notifications | `GET /v1/notifications`, WS `/v1/ws/notifications` |
| Admin: courts | `GET/POST/PATCH/DELETE /v1/courts` |
| Admin: config | `GET/PATCH /v1/club/config` |

---

## Deploy (Dokploy)

The repo's `docker-compose.yml` builds all three services. In Dokploy:

1. Point a domain at the **web** service (port 3000) and, if the browser calls the
   API directly, a domain at the **api** service (port 8000).
2. Set these environment variables:

   | Variable | What it's for |
   |---|---|
   | `JWT_SECRET` | Long random string that signs login tokens |
   | `POSTGRES_PASSWORD` | Database password |
   | `API_PUBLIC_URL` | The API's public URL, baked into the web build so the browser knows where to call |
   | `CORS_ORIGINS` | The web app's public origin |

3. Deploy. Confirm it's live at `<api-domain>/health` (should return
   `{"status":"ok"}`).

---

## What's intentionally deferred

- **Payments** aren't processed — AcePair calculates and records fee splits; a
  processor can be added behind the existing ledger without a rewrite.
- **Live discover/my-games** read from the API when signed in and fall back to demo
  data otherwise; the join/book/host *actions* in the demo UI are optimistic
  previews (the real, tested endpoints power them once the API URL is wired).
- **Scale-out:** live notifications and the matchmaking sweeper run in-process
  (perfect for one app container). Redis pub/sub + a dedicated worker are the
  documented next step for running multiple copies.
- **Time zones:** peak-hour pricing is evaluated on the booking's wall-clock; a
  per-club timezone is stored in config and is the natural next refinement.
