# Callista — personal health history

A small self-hosted app to log consumption (fluids, vitamins, medicine) and
review it in a weekly items-by-day table, daily volume summaries and a
30-day trend chart. Built as a Node.js + Express API with a React (Vite)
frontend on an existing MySQL database.

Source: https://github.com/rickyfredy/personal-health.git ·
Requirements & scope: [prd.md](prd.md)

The existing `consumption_history` table is used **as-is — nothing in it was
changed**. The app adds a separate `users` table (login), a tiny `seed_meta`
table (so sample seeding never duplicates), and `ngt_history` (NGT tube
changes — **read-only for the app**; rows are written by an external channel):

```sql
-- your external channel inserts like this
INSERT INTO ngt_history (measurement, consumption_time, created_at)
VALUES (31.50, '2026-10-25 23:43:58', NOW());
```

Columns: `measurement` = tube size (decimal), `consumption_time` = when it
was changed, `created_at` = logging moment. The dashboard lists them
newest-first, 5 per page.

## Medical records (HealthHub imports)

Exports from HealthHub (Lab Results / Discharge Summaries, `.json`) are
imported with:

```bash
npm --prefix server run ingest <export1.json> [export2.json ...]
```

The import is **idempotent** — each entry carries the export's own id, so
re-running an import updates rows instead of duplicating them. Lab reports
store their full test-row tables; discharge summaries keep diagnoses,
procedures, allergies, alerts and the medication text.

⚠️ Do NOT commit these export files — they contain personal identifiers.
They are git-ignored (`*HealthHub*`).

## Quick start

```bash
# 0. Configure: copy the example env and fill in your database values
#    (.env is NOT in the repository — it holds your credentials)
cp .env.example .env

# 1. One-time: install everything
npm --prefix server install
npm --prefix client install

# 2. (Optional) seed ~2 months of sample data for testing
npm --prefix server run seed

# 3. Build the frontend and start the app (single port)
npm --prefix client run build
npm --prefix server start
```

Then open **http://localhost:3001** (lands on the Dashboard) and sign in with the
default account:

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

(Change `DEFAULT_PASSWORD` in `.env` **before** first boot if you want
something else; the account is created on first start.)

### Development mode (hot reload)

```bash
npm --prefix server start                      # API on :3001
npm --prefix client run dev                    # UI on :5173, proxies /api to :3001
```

## Configuration (`.env`)

| Variable              | What it does |
|-----------------------|--------------|
| `PORT`                | HTTP port (dev UI proxies here; prod serves the UI here) |
| `APP_TIMEZONE`        | Wall-clock timezone for "last 7 days" and day/week/month buckets |
| `DB_HOST` / `DB_PORT` | MySQL server address |
| `DB_USER` / `DB_PASSWORD` | MySQL credentials |
| `DB_NAME`             | Database name (`callista_history`) |
| `DB_CONNECTION_LIMIT` | Max pool connections |
| `SESSION_SECRET`      | Cookie-signing secret (any long random string) |
| `SESSION_TTL_HOURS`   | How long a login lasts |
| `DEFAULT_USERNAME` / `DEFAULT_PASSWORD` | Default account, created on first boot only |
| `CART_WINDOW_MINUTES` | Gap that ends a "cart" grouping (see below) |
| `DEFAULT_DASHBOARD_ITEM` | The primary "milk" item: drives the dashboard's daily summary and 30-day volume chart (case-insensitive match against existing names; empty = shows all items) |

## What "cart" means here

Your `consumption_history` table has no cart column, and this app does not
add one. A **cart** is derived automatically: walking the records
chronologically, a new cart starts whenever the gap to the previous record
exceeds `CART_WINDOW_MINUTES` (default 15). So items given at 09:00 and
09:05 group into one cart, while an 10:30 record starts a new one.

## Reordering records

Ordering rule: `consumption_time DESC` (ties break by newest id). Since the
order key **is** the consumption time, reordering works in two ways:

1. **Edit** a record's "consumed at" datetime (the modal form), or
2. **Up/down arrows** in the row — the record's time is adjusted relative
   to its neighbour in the sorted list (it swaps with the neighbour, or is
   nudged by one minute on an exact tie).

## Notes on dates

`consumption_history` stores wall-clock datetimes exactly as entered
(e.g. `2026-10-07 09:00:00`). The app reads them as strings and never
converts timezones, so what you see is what was recorded. `created_at` is
written with `UTC_TIMESTAMP()` to match how the existing rows were stored.
Day/week/month grouping uses `APP_TIMEZONE` from `.env`.

## API summary

| Method | Path                          | Purpose |
|--------|-------------------------------|---------|
| POST   | `/api/auth/login`             | Sign in (sets a session cookie) |
| POST   | `/api/auth/logout`            | Sign out |
| GET    | `/api/auth/me`                | Current user |
| GET    | `/api/consumptions`           | Paged list + search (`q`) + filters (`range` 7d/30d/all/custom, `from`, `to`, `unit`, `page`, `pageSize`) |
| GET    | `/api/consumptions/meta`      | Distinct units for the filter bar |
| POST   | `/api/consumptions`           | Create |
| PUT    | `/api/consumptions/:id`       | Update |
| DELETE | `/api/consumptions/:id`       | Delete |
| POST   | `/api/consumptions/:id/move`  | Reorder `{direction: "up"\|"down"}` |
| GET    | `/api/summary/matrix`         | The "This week" table (items × Sun–Sat); optional `q`, `week=<offset, 0=today's week, -1=previous…>` |
| GET    | `/api/summary/feeds`          | The daily summary card (volumes for one day, grouped like carts); optional `q`, `day=<record-days back from the most recent, 0=most recent>` |
| GET    | `/api/summary/daily`          | Last 30 wall-clock days as continuous buckets; optional `q` (powers the 30-day milk volume chart) |
| GET    | `/api/ngt/changes`            | NGT tube changes from `ngt_history` (app reads only — writes come from an external channel); `page` of 5 per page |
| GET    | `/api/labs`                   | Lab report list (`q` title filter, `abnormal=1`, `limit`, cap 1000) + totals |
| GET    | `/api/labs/:id/rows`          | Full test-row table of one report |
| GET    | `/api/discharge`              | Discharge summaries with parsed details; `limit` (cap 200) |

All non-auth endpoints require the session cookie; server-rendered list
ordering is always `consumption_time DESC`.