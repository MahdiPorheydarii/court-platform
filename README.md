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

You need Docker. Set a couple of secrets first (nothing is hardcoded):

```bash
cp .env.example .env    # then set POSTGRES_PASSWORD, JWT_SECRET, SEED_DEMO_PASSWORD
docker compose up --build
```

> For local access, temporarily add `ports: ["8000:8000"]` / `["3000:3000"]` to
> the `api`/`web` services — the committed compose omits host ports because the
> hosted deploy routes by domain via Traefik.

Then (with ports mapped) open:

- **Web app** → http://localhost:3000
- **API docs** (interactive) → http://localhost:8000/docs
- **API health** → http://localhost:8000/health

The API seeds a **demo club** on first boot so nothing is empty:

| Field | Value |
|---|---|
| Club address | `riverside` |
| Email | `alex@riverside.club` |
| Password | your `SEED_DEMO_PASSWORD` |

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

The repo's `docker-compose.yml` builds all three services. No host ports are
published — Traefik routes to the `web` (3000) and `api` (8000) containers by
domain. In Dokploy:

1. Point a domain at the **web** service and, since the browser calls the API
   directly, a domain at the **api** service.
2. Set these environment variables (see `.env.example`):

   | Variable | What it's for |
   |---|---|
   | `POSTGRES_PASSWORD` | Database password (required) |
   | `JWT_SECRET` | Long random string that signs login tokens (required) |
   | `API_PUBLIC_URL` | The API's public URL, baked into the web build so the browser knows where to call |
   | `CORS_ORIGINS` | The web app's public origin |
   | `ROOT_DOMAIN` | Domain clubs live under (e.g. `acepair.ir`); enables club subdomains + their CORS |
   | `SEED_DEMO_PASSWORD` | Password for the seeded demo login |

3. Deploy. Confirm it's live at `<api-domain>/health` (should return
   `{"status":"ok"}`).

### Each club has its own page

Every club is reachable two ways — no extra setup for the first:

- **By path** (works immediately): `acepair.ir/riverside` shows the club's
  join / sign-in landing page.
- **By subdomain** (optional, per club): `riverside.acepair.ir`. To turn one on:
  1. Add a DNS record for the subdomain pointing at the server (an `A` record to
     the server IP, or a `CNAME` to the apex).
  2. In Dokploy, add that subdomain as a domain on the **web** service. Traefik
     routes it and Let's Encrypt issues the certificate automatically (HTTP-01).

  No wildcard cert or DNS API token is needed for individual subdomains. The app
  resolves the club from the hostname (`ROOT_DOMAIN`), and CORS already allows
  the apex plus any `*.<ROOT_DOMAIN>` subdomain.

---

## Points to confirm (answered)

The brief left five things open. Here's how AcePair resolves each — all
per-club configurable.

**1. Matchmaking criteria — how players are matched.**
A member posts a "looking for players" request with sport, their skill level,
a time preference (a day + morning/afternoon/evening window), and duration.
AcePair groups compatible open requests when they share: the same sport, an
overlapping time window (so a common start time exists), skill within the
club's tolerance (default ±1 band on Beginner → Improver → Intermediate →
Advanced), the same duration, and compatible court preference. When a group
reaches the club's minimum player count it **auto-confirms** — creating the
booking, the fee split, and notifications. A member's skill level is saved to
their profile, so it's pre-filled next time (and editable any time).

**2. Fee model — rate, peak, and partial groups.**
Fee = base rate **per court, per hour** × duration × a **peak multiplier** when
the start falls in a configured peak window. It's split **evenly among
confirmed players**, reconciled to the penny (integer cents; any remainder is
distributed one cent at a time). Under-filled groups are handled per the club's
`unfilled_policy`: `cancel` (default — void, no charge), `partial` (present
players split the whole fee), or `absorb` (each present player pays one fair
quorum-share and the club covers the empty seats).

**3. Cancellation & no-shows.**
Each club sets a cancellation window (hours). **Bookings:** cancelling outside
the window frees the slot and waives the charge; inside the window frees the
slot but the charge stands. **Matched games:** leaving frees your spot — outside
the window your share is waived, inside it stands; the host role reassigns
automatically; a match that never fills by its start time is resolved by the
unfilled policy above.

**4. Payment handling — collect or calculate?**
AcePair **only calculates and records** fee splits; it does not move money.
Every booking produces an auditable **ledger** (one row per player). The code is
structured so a processor like Stripe drops in behind the ledger without a
rewrite.

**5. Notifications.**
Every member has a persisted notification feed (the bell menu) **plus a live
WebSocket stream**. They're notified on: match confirmed, a player joined or
left their match, a match cancelled for not filling, booking confirmed, booking
cancelled, and split invitations. The delivery channel is pluggable, so email
or push can be swapped in later.

## Assumptions & what's deferred

AcePair is a working, deployable product, but it makes some deliberate scope
choices. For a real production launch, the notable assumptions and gaps are:

**Money & payments**
- **No payment processing.** AcePair calculates and records fee splits in an
  auditable integer-cents ledger, but no money moves — a processor (Stripe etc.)
  plugs in behind the existing ledger. Cancellation policy is *computed* (charge
  stands vs. waived), but there's no actual charge or refund yet.
- **No revenue dashboard / settlement.** The ledger data exists; a club-facing
  "who owes what / mark paid / payouts" view is not built.

**Accounts & security**
- **Password-only auth.** No email verification, password reset, social/SSO
  login, or 2FA. No login rate-limiting, captcha, or abuse protection.
- **No GDPR tooling** (data export/delete), audit log, or ToS/privacy flows.

**Club operations (admin)**
- The admin panel now covers courts, **opening hours & slot lengths**, a
  **week schedule**, **recurring court holds**, **bookings management**, a
  **member directory**, pricing, peak hours, and cancellation/unfilled rules.
- Still deferred: **per-court / per-day hours** and one-off **maintenance
  blackouts** (only club-wide hours + recurring holds today); **member invites,
  approvals, role changes, and removal** (the directory is read-only); and
  **self-serve club-profile editing** (name, location, tagline, cover, sports
  are set via API/seed, not the panel).

**Notifications**
- **In-app only.** Notifications are stored and pushed live over WebSocket;
  there is **no email / SMS / push** delivery, which a real club would expect.

**Content, media & i18n**
- **English / USD only** — no localization, currency formatting per region, or
  RTL. A per-club `timezone` and `currency` are stored in config but not yet
  surfaced or fully applied (peak pricing uses the booking's wall-clock).
- **Images** are static assets in `/public` and set by URL; there's no upload
  pipeline or object-storage/CDN, and photography is illustrative/demo.
- The **landing copy and marketing content** are demo-grade, not final.

**Discovery & platform**
- **No club search / geolocation ("clubs near me") / maps.** The apex shows a
  curated showcase, not a searchable directory.
- **Frontend has no automated tests** (the backend does, with a real Postgres via
  testcontainers). No end-to-end suite, metrics/tracing, or alerting wired in.

**Scale-out**
- Live notifications and the matchmaking sweeper run **in-process** (ideal for a
  single app container). Redis pub/sub + a dedicated worker are the documented
  next step for running multiple copies.
