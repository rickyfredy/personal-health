# Callista — project notes for Claude sessions

Personal health-history app for Callista (baby, b. Feb 2025): consumption logging
(fluids/vitamins/medicine), dashboards, and medical records from HealthHub exports.

## Layout

- `server/` — Node + Express API (mysql2, express-session on MySQL, bcryptjs).
  `src/index.js` entry; routes: auth, consumptions (CRUD+paging+search), summary
  (+`/matrix`, `/feeds`, `/daily`), ngt, labs, discharge, timeline, food.
  `src/ingest-healthhub.js` = HealthHub JSON importer (idempotent, ext_id dedupe);
  `src/seed.js` = demo data (additive, guarded by `seed_meta`).
- `client/` — React 18 + Vite SPA (recharts). Built to `client/dist`, served by the
  API in production. Components: `DashCards.jsx` (shared cards + date helpers),
  `DatePicker.jsx` (styled calendar popup).
- Everything runtime-configurable lives in `.env` (see `.env.example`).

## Where it runs

- DEV: ricky's Mac — server :3001; MySQL `callista_history` at 192.168.10.2:3306
  (root/admin) — wall-clock datetimes, `dateStrings: true`, never TZ-convert;
  `created_at` uses UTC_TIMESTAMP.
- LIVE: https://callista-pa.rfportfolio.online (rfserver via `root@rfportfolio.online`,
  SSH key `/Users/ricky/Documents/.ssh/id_ed25519`). App cloned at
  `/var/www/personal-health`; pm2 name `callista`, port 8013; nginx vhost
  `callista-pa.rfportfolio.online` → 8013 (wildcard cert in /root/ssl/).
  Server MySQL = Docker `resume_mysql`, user `callista_claw` (weak pw, ricky's choice;
  rotate later), granted @'%' for the Docker bridge; MySQL port firewalled externally.

## Deploy flow

1. Commit + push from here → GitHub `rickyfredy/personal-health`.
2. `ssh` to rfserver: `cd /var/www/personal-health && git pull --ff-only`,
   `npm --prefix client run build` (only if client changed), `pm2 restart callista`.
- Amending pushed commits breaks the server clone's ff-pull → `git fetch` +
  `git reset --hard origin/main` there.
- index.html must stay `Cache-Control: no-cache` (hashed assets cache forever).

## Invariants

- NEVER change `consumption_history`'s schema; times are wall-clock strings as entered.
- External channels OWN two tables (app reads only): `ngt_history` (tube size + time,
  written by a channel) and `meal_photos` (dietary assistant: meal_type enum
  breakfast|lunch|dinner|snack, photo_path file in /root/.openclaw workspace).
- HealthHub export files are PII — git-ignored (`/HealthHub-*`); never commit them.
- pkill in scripts can match the script's own bash argv — kill via pgrep loop
  excluding $$/$PPID instead.

## Checks before deploy

- `npm --prefix client run check:undef` (catches shipped-undefined-import blanks).
- The API test-suite pattern: login via /api/auth/login, exercise endpoints + CRUD
  cycle; totals have matched DB aggregates on every change so far.
