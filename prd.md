# PRD — Callista, a personal health history app

Version 1.0 · 2026-10-20 · Owner: ricky · Repo: https://github.com/rickyfredy/personal-health.git

## 1. Overview

Callista is a small self-hosted web app for logging everything a family member
consumes — formula milk, vitamins, medicine — and reviewing it quickly. It
answers two questions at a glance: "what was consumed over the last 7 days?"
and "how do consumption patterns look over time?". It runs on the household
network against an existing MySQL database.

## 2. Background

Consumption entries already existed in a MySQL table,
`callista_history.consumption_history`, maintained by hand. The app is built
around that table as-is: no columns were added or changed. A caretaker needs
to log each feeding/medicine moment in seconds, then later review days,
weeks and months without SQL.

## 3. Goals and non-goals

Goals for v1:

- Fast daily logging with full CRUD on consumption records.
- A clean 7-day view (the "what happened recently" answer) with paging,
  search and filters.
- Ordering derived from `consumption_time DESC`, with a way to change the
  order when a mistake was made.
- A dashboard that summarises by day, week and month, includes a weekly
  items-by-weekday table and a per-day volume summary, and tracks "carts" —
  groupings of items taken together.
- Every runtime setting (database, port, timezone, session, defaults) lives
  in one `.env` file.

Non-goals for v1: multiple user accounts or roles, public internet hosting,
a mobile app, notifications/reminders, CSV export, and any modification of
the existing table's schema. Some of these are candidate future work
(see §11).

## 4. Users and key scenarios

Primary user is the household caretaker (single admin user). Key scenarios:

1. After a feeding, open the app, add a record: item name, amount, unit,
   time (defaults to now).
2. Each evening, scan the last-7-days list; search for a specific item;
   filter by unit; correct mistakes by editing or deleting records.
3. Open the dashboard (the default page): check today/7-day/30-day stats,
   the weekly milk table, and the per-day volumes; page back to see previous
   weeks and days.

## 5. Feature requirements

### 5.1 Login

- Default account `admin` / `admin`, created on first boot (from
  `DEFAULT_USERNAME` / `DEFAULT_PASSWORD` in `.env`), password stored as a
  bcrypt hash.
- Session cookie (httpOnly, sameSite) valid for `SESSION_TTL_HOURS`
  (default 72), stored in MySQL so logins survive server restarts.
- Wrong credentials return a single generic error that never reveals which
  field was wrong.
- Every non-auth endpoint returns 401 without a valid session.

### 5.2 Consumption list (CRUD page)

- Defaults to the last 7 days, ordered `consumption_time DESC` (ties break
  by newest id).
- Page sizes 10/20/50, client-shown page numbers, total count.
- Search: free-text, case-insensitive substring on item name (debounced).
- Filters: date range (last 7 days / 30 days / all time / custom from–to)
  and unit (dropdown of units that exist in the data).
- Create + edit in a modal: name (required, ≤ 50 chars), amount
  (positive number), unit (required, ≤ 10 chars), consumed-at datetime
  (defaults to now). Validation errors are per-field, server-enforced.
- Delete with a confirmation step.
- Reordering: because the order key is `consumption_time` itself, records
  can be moved with up/down arrows. A move swaps the record's time with its
  neighbour in the sorted list; on an exact tie the record is nudged by one
  minute past the neighbour. Editing the time directly is the other way to
  reorder.

### 5.3 Dashboard

The dashboard is the default page (`/`) and first item in the menu.

- **Filter**: an item dropdown built from the distinct names that exist in
  records (not free text). Defaults to `DEFAULT_DASHBOARD_ITEM` from `.env`
  ("Peptamen junior" in the shipped config), matched case-insensitively;
  "All items" clears it. Selection is an exact item match.
- **Stat band**: today, last 7 days, last 30 days (record counts + units),
  and carts this week.
- **Charts** (stacked per unit, since units can differ): daily for the last
  30 days, weekly for the last 8 ISO weeks (Monday start), monthly for the
  last 6 months.
- **"This week" table**: items as rows, Sunday→Saturday with day numbers as
  columns, cells like `100 ml`, `-` when nothing was recorded; rows sorted
  most-active-first. Paging buttons move to previous weeks (up to ~2 years
  back) or forward (clamped to next week). Title and date range update with
  paging.
- **Daily summary table**: feed sessions of one day as time → volume rows.
  The day starts at the most recent day that has records (for the selected
  item when filtered) and paging steps back through record-days — days with
  no records are skipped rather than shown empty. Sessions are groupings of
  items taken within the cart window (below). With an item selected, only
  sessions containing that item appear, and volumes cover just that item;
  with "All items", every session of the day appears.
- **Cart summaries**: carts per week and per month (cart count, item count,
  volumes) plus a recent-carts detail list.
- **Per-card updates**: paging (and Refresh) refetch each card's data
  independently via dedicated endpoints, so flipping weeks or days never
  re-renders the charts and stats. The updating card dims briefly while its
  data reloads.
- A "cart" is derived, not stored: walking records chronologically, a new
  cart starts whenever the gap to the previous record exceeds
  `CART_WINDOW_MINUTES` (default 15). A cart appears under an item filter if
  any item in it matches.

### 5.4 Configuration

All runtime configuration lives in `.env` (see README for the full table):
port, app timezone, database host/port/user/password/name/pool size, session
secret and TTL, default account, cart window, and the dashboard's default
item. `.env` is git-ignored; `.env.example` documents every key with
placeholders.

## 6. Data model

- `consumption_history` (existing, untouched):
  `id, name varchar(50), amount float, measurement varchar(10),
  consumption_time datetime, created_at datetime`.
- `users` (added by the app on first boot): `id, username (unique),
  password_hash, created_at`.
- `seed_meta` (added by the seed script): remembers that sample data was
  seeded so re-runs never duplicate.

Time semantics: `consumption_time` is stored as the wall-clock value exactly
as entered (e.g. `2026-10-07 09:00:00`) and never converted; the app reads
datetimes as strings. `created_at` is written with `UTC_TIMESTAMP()`. Day,
week and month buckets follow `APP_TIMEZONE` from `.env` so "today" matches
the household clock.

## 7. Architecture

- **Backend** (`server/`): Node.js + Express. mysql2 connection pool
  (`dateStrings: true`), express-session with a MySQL session store, bcryptjs
  for passwords. REST API under `/api`: auth, consumptions (list with
  paging/search/filter, CRUD, move), summary (base), summary/matrix,
  summary/feeds, plus `/api/consumptions/meta` for filter options.
- **Frontend** (`client/`): React 18 + Vite SPA with react-router and
  recharts; built to `client/dist` and served by the same Express process in
  production (dev mode uses the Vite dev server proxying `/api`).
- **Seeding**: `npm --prefix server run seed` inserts ~2 months of realistic
  sample records purely additively, guarded by `seed_meta`

## 8. Non-functional requirements

- Security: bcrypt-hashed passwords, httpOnly session cookies, auth guard on
  every non-auth route, generic login errors, parameterised SQL everywhere,
  no secrets in git (`.gitignore` covers `.env*` variants).
- Performance: server-side paging and aggregation; personal-data volumes
  (hundreds of rows) respond instantly; charts render client-side.
- Correctness: ISO week math is Thursday-based (handles year rollover);
  wall-clock datetimes are never timezone-shifted; all list endpoints are
  verified by an API test suite (auth guard, paging math, search/filter,
  CRUD cycle, reorder invariants, aggregation shapes).
- Robustness: the app never mutates `consumption_history`'s schema; seeding
  is additive and refuses to double-run; clamps on paging offsets.

## 9. API surface

| Method | Path                      | Purpose |
|--------|---------------------------|---------|
| POST   | `/api/auth/login`         | Sign in (session cookie) |
| POST   | `/api/auth/logout`        | Sign out |
| GET    | `/api/auth/me`            | Current user |
| GET    | `/api/consumptions`       | Paged list: `range` 7d/30d/all/custom, `from`, `to`, `q` (substring), `unit`, `page`, `pageSize` |
| GET    | `/api/consumptions/meta`  | Units, distinct item names, default dashboard item |
| POST   | `/api/consumptions`       | Create record |
| PUT    | `/api/consumptions/:id`   | Update record |
| DELETE | `/api/consumptions/:id`   | Delete record |
| POST   | `/api/consumptions/:id/move` | Reorder (`direction` up/down) |
| GET    | `/api/summary`            | Day/week/month aggregates, cart summaries, stats |
| GET    | `/api/summary/matrix`     | Weekly table; `week` offset paging |
| GET    | `/api/summary/feeds`      | Daily summary; `day` offset paging |

## 10. Acceptance criteria

1. A fresh clone plus `cp .env.example .env`, `npm install` in `server/` and
   `client/`, `npm run build` in `client/`, and `npm start` in `server/`
   yields a working app on port 3001, reachable with admin/admin.
2. The consumption page opens on the last 7 days, newest first; paging,
   search, unit filter and date-range filters all return consistent counts.
3. Adding, editing and deleting records reflects immediately, with
   server-side validation rejecting empty names, non-positive amounts and
   invalid dates.
4. Up/down arrows visibly reorder rows while the consumption_time DESC
   ordering rule stays intact.
5. The dashboard opens by default; the item dropdown defaults to the
   configured item; the weekly table and daily summary match manual SQL
   spot-checks; paging moves both tables without re-rendering the charts.
6. `.env` never appears in `git status` or in the repository.
7. Running the seed script twice does not create duplicates.

## 11. Future work candidates

- A master item table (pre-register items, aliases like "Milk" for
  "Peptamen junior", per-item default dosage).
- CSV/PDF export of history.
- Reminders for scheduled feeds or medicine courses.
- Multi-user accounts with audit trail.
- Week navigation shared across all dashboard cards.