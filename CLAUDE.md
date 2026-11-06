# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal health-history app for Callista (baby, b. Feb 2025): consumption logging
(fluids/vitamins/medicine), dashboards, medical records from HealthHub exports, and
a Food Report from a dietary assistant's photos. Requirements & scope: `prd.md`.

## Commands

```bash
# one-time install
npm --prefix server install
npm --prefix client install

# dev = two processes (the Vite dev proxy reads the ROOT .env for the API port)
npm --prefix server start        # API on :3001 (also serves client/dist if built)
npm --prefix client run dev      # Vite UI on :5173, proxies /api → :3001

# production build (single port :3001 serves API + UI)
npm --prefix client run build

# demo data (~55 days) — additive, refuses to re-run; --force to add more
npm --prefix server run seed -- --force

# import HealthHub exports (idempotent; files are git-ignored PII)
npm --prefix server run ingest <HealthHub-export.json> ...
```

There is no test runner in this repo. Testing has always been an ad-hoc API suite
against a live DB: login via `/api/auth/login` (store the cookie), exercise
endpoints + a CRUD cycle, and compare endpoint totals against SQL aggregates.

## Layout & architecture

- `server/` — Node + Express API (CommonJS, `src/index.js` entry). Boot order:
  `bootstrap()` → session middleware (express-mysql-session **reuses the same
  mysql2 pool** as the app) → routes → static serving of `client/dist`
  (index.html `no-cache`; hashed assets immutable) → SPA fallback on any
  non-`/api` GET.
- `server/src/db.js` — mysql2 pool with `dateStrings: true`; all config from
  `.env` (see `.env.example`).
- `server/src/bootstrap.js` — first-boot DDL only: creates `users`
  (+ default admin from `DEFAULT_USERNAME`/`DEFAULT_PASSWORD`) and
  `ngt_history`, `lab_reports`, `lab_result_rows`, `discharge_records`.
- `server/src/routes/` — auth (the one unguarded mount), consumption
  (CRUD + paging/search/filters + `move`), summary (`/matrix`, `/feeds`,
  `/daily`), ngt, labs, discharge, timeline, food. Everything else sits behind
  `server/src/middleware/auth.js` (session checks `req.session.userId`).
- `server/src/ingest-healthhub.js` — HealthHub JSON importer: detects the export
  kind from its top-level shape (`reports: []` = labs, `records: []` = discharge)
  and upserts keyed on the export's own id (`ext_id`), so re-import updates
  instead of duplicating. Lab test rows are delete-then-reinserted per report.
- `server/src/seed.js` — demo data; additive only, guarded by the `seed_meta`
  table.
- `client/` — React 18 + Vite SPA (react-router, recharts). `src/api.js` is the
  single fetch layer (throws `ApiError{status, message, errors}`);
  `src/App.jsx` gates all routing on the session (`/api/auth/me` on mount).
  Pages in `src/pages/`; Dashboard composes several independent per-card
  fetches. Shared cards + date/format helpers live in
  `components/DashCards.jsx`; the styled calendar popup is
  `components/DatePicker.jsx`.

### Time model (the load-bearing detail)

`consumption_time` is a **wall-clock string exactly as entered**; the app reads
datetimes as strings (`dateStrings: true`) and never lets the driver convert
them. `created_at` is always written with `UTC_TIMESTAMP()`. Day/week/month
buckets follow `APP_TIMEZONE` from `.env`. Technique used in
`server/src/time.js` (`localNow()`) and `routes/summary.js` (`iso()`/`addDays()`):
format through `Intl` in the target TZ, then reassemble a **dummy-UTC Date**
whose get*() methods return the APP_TIMEZONE wall-clock values. Reuse this
pattern for any new date math — do not add real TZ conversion.

### Derived concepts (no schema backing)

- **Cart**: there is no cart column. Walking records chronologically, a new
  cart starts whenever the gap to the previous record exceeds
  `CART_WINDOW_MINUTES` (`.env`, default 15).
- **Ordering**: the order key IS `consumption_time` (DESC, `id DESC`
  tie-break). Reordering (`POST /api/consumptions/:id/move`) swaps times with
  the neighbour, or nudges ±1 minute past it on an exact tie.
- **"milk" item**: `DEFAULT_DASHBOARD_ITEM` in `.env`, resolved
  case-insensitively against existing item names.

### Table ownership

| Table | Created by | Writes |
|---|---|---|
| `consumption_history` | pre-existing | app CRUD — schema is FROZEN |
| `users`, `seed_meta`, `lab_reports`, `lab_result_rows`, `discharge_records` | bootstrap / seed / ingest | app |
| `ngt_history` | bootstrap (shape only) | external channel (app reads) |
| `meal_sessions` | dietary channel (not created here) | external channel (app reads) |
| `meal_photos` | dietary channel (session_id FK → meal_sessions) | external channel (app reads; serves photo bytes at `/api/food/photo/:id`); one row PER image |

## Where it runs

- DEV: ricky's Mac — server :3001; MySQL `callista_history` at 192.168.10.2:3306
  (root/admin).
- LIVE: https://callista-pa.rfportfolio.online (rfserver via `root@rfportfolio.online`,
  SSH key `/Users/ricky/Documents/.ssh/id_ed25519`). App cloned at
  `/var/www/personal-health`; pm2 name `callista`, port 8013; nginx vhost
  `callista-pa.rfportfolio.online` → 8013 (wildcard cert in /root/ssl/).
  Server MySQL = Docker `resume_mysql`, user `callista_claw` (weak pw, ricky's
  choice; rotate later), granted @'%' for the Docker bridge; MySQL port
  firewalled externally.

## Deploy flow

1. Commit + push from here → GitHub `rickyfredy/personal-health`.
2. `ssh` to rfserver: `cd /var/www/personal-health && git pull --ff-only`,
   `npm --prefix client run build` (only if client changed), `pm2 restart callista`.
- Amending pushed commits breaks the server clone's ff-pull → `git fetch` +
  `git reset --hard origin/main` there.
- index.html must stay `Cache-Control: no-cache` (the hash-handling in
  `src/index.js` depends on it; stale HTML = blank/mixed UIs).

## Invariants

- NEVER change `consumption_history`'s schema; times are wall-clock strings as entered.
- External channels OWN the meal/dietary tables (app reads only): `ngt_history`
  (tube size + time, written by a channel) and the Food Report pair —
  `meal_sessions` (one row per eating session: meal_type enum
  breakfast|lunch|dinner|snack + consumption_time) and `meal_photos` (one row
  PER image, session_id FK → meal_sessions, photo_path in the OpenClaw
  workspace). Redesigned 2026-11-06 from a flat meal_photos table.
- HealthHub export files are PII — git-ignored (`/HealthHub-*`); never commit them.
- pkill in scripts can match the script's own bash argv — kill via pgrep loop
  excluding $$/$PPID instead.

## Checks before deploy

- `npm --prefix client run check:undef` (catches shipped-undefined-import blanks).
- Run the API smoke-suite pattern once: login, exercise endpoints + CRUD cycle;
  totals have matched DB aggregates on every change so far.
