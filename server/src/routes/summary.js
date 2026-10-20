const express = require('express');
const db = require('../db');
const { localNow, TZ } = require('../time');

const router = express.Router();

// GET /api/summary          → time buckets (day/week/month), carts, stats
// GET /api/summary/matrix   → the "This week" table (items × Sun..Sat)
// GET /api/summary/feeds    → the daily summary (one day's sessions + volumes)
// Split so the dashboard can page the two tables without refetching charts.
//
// A cart = records within CART_WINDOW_MINUTES of each other (derived, no
// schema change). A name filter (?q=) is an exact, case-insensitive item
// name; carts count whole when any item in them matches.

router.get('/', async (req, res, next) => {
  try {
    const { q, nameCond, nameParams, ql } = parseQ(req);
    const { windowMinutes, windowMs } = cartWindow();

    const now = localNow();
    const isoStart = iso(now);

    // ---------- daily: last 30 wall-clock days ----------
    const dayStart = addDays(new Date(isoStart + 'T00:00:00Z'), -29);
    const [dailyRaw] = await db.query(
      `SELECT DATE(consumption_time) AS d, measurement AS unit,
              SUM(amount) AS total, COUNT(*) AS c
       FROM consumption_history
       WHERE consumption_time >= ?${nameCond}
       GROUP BY d, unit`,
      [iso(dayStart) + ' 00:00:00', ...nameParams]
    );
    const dailyList = fillBuckets(
      spanDates(dayStart, now, (d) => iso(d)),
      groupBy(dailyRaw, 'd')
    ).map(({ date, count, byUnit }) => ({ date, count, byUnit }));

    // ---------- weekly: last 8 ISO weeks (Monday start) ----------
    const thisWeekStart = isoWeekStart(now);
    const weekKeys = [];
    for (let i = 7; i >= 0; i--) weekKeys.push(isoWeekKey(addDays(thisWeekStart, -7 * i)));
    const [weeklyRaw] = await db.query(
      `SELECT YEARWEEK(consumption_time, 3) AS wk, measurement AS unit,
              SUM(amount) AS total, COUNT(*) AS c
       FROM consumption_history
       WHERE consumption_time >= ?${nameCond}
       GROUP BY wk, unit`,
      [iso(addDays(thisWeekStart, -49)) + ' 00:00:00', ...nameParams]
    );
    const weeklyList = fillWeeks(weekKeys, groupBy(weeklyRaw, 'wk'));

    // ---------- monthly: last 6 calendar months ----------
    const { keys: monthKeys, from: monthFrom } = monthHorizon(now);
    const [monthlyRaw] = await db.query(
      `SELECT DATE_FORMAT(consumption_time, '%Y-%m') AS m, measurement AS unit,
              SUM(amount) AS total, COUNT(*) AS c
       FROM consumption_history
       WHERE consumption_time >= ?${nameCond}
       GROUP BY m, unit`,
      [monthFrom, ...nameParams]
    );
    const monthlyList = fillMonths(monthKeys, groupBy(monthlyRaw, 'm'));

    // ---------- carts & rollups ----------
    const carts = await buildCarts(monthFrom, windowMs);
    const matchedCarts = ql
      ? carts.filter((c) => c.items.some((it) => it.name.toLowerCase() === ql))
      : carts;

    const cartWeekly = fillContainers(weekKeys, matchedCarts, 'wk');
    const cartMonthly = fillContainers(monthKeys, matchedCarts, 'm');
    const recentCarts = matchedCarts
      .slice(-8)
      .reverse()
      .map(({ _start, ...c }) => ({ ...c, byUnit: sumUnits(c.items) }));

    // ---------- headline stats ----------
    const todayBucket = dailyList[dailyList.length - 1] || { count: 0, byUnit: {} };
    const stats = {
      todayCount: todayBucket.count,
      todayByUnit: todayBucket.byUnit,
      week7: sumDaily(dailyList.slice(-7)),
      month30: sumDaily(dailyList)
    };

    res.json({
      tz: TZ,
      filter: q || null,
      cartWindowMinutes: windowMinutes,
      daily: dailyList,
      weekly: weeklyList,
      monthly: monthlyList,
      cartWeekly,
      cartMonthly,
      recentCarts,
      stats
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/matrix?week=N
// week: 0 = current Sunday-start week, -1 = previous, ...
router.get('/matrix', async (req, res, next) => {
  try {
    const { q, nameCond, nameParams } = parseQ(req);
    const weekOffset = Math.max(-104, Math.min(1, parseInt(req.query.week, 10) || 0));

    const now = localNow();
    const dow = now.getUTCDay(); // 0 = Sunday
    const weekStartDate = addDays(new Date(iso(now) + 'T00:00:00Z'), -dow + 7 * weekOffset);
    const weekEnd = addDays(weekStartDate, 7);
    const dates = [];
    for (let i = 0; i < 7; i++) dates.push(iso(addDays(weekStartDate, i)));

    const [matrixRaw] = await db.query(
      `SELECT name, measurement AS unit, DATE(consumption_time) AS d,
              SUM(amount) AS total, COUNT(*) AS c
       FROM consumption_history
       WHERE consumption_time >= ? AND consumption_time < ?${nameCond}
       GROUP BY name, unit, d`,
      [dates[0] + ' 00:00:00', dates[6] + ' 23:59:59.999', ...nameParams]
    );
    const rowsMap = new Map(); // name -> { cells: {date: {unit: total}}, count }
    for (const r of matrixRaw) {
      const date = String(r.d);
      if (!rowsMap.has(r.name)) rowsMap.set(r.name, { cells: {}, count: 0 });
      const row = rowsMap.get(r.name);
      if (!row.cells[date]) row.cells[date] = {};
      row.cells[date][r.unit] = round2((row.cells[date][r.unit] || 0) + Number(r.total));
      row.count += Number(r.c);
    }
    const rows = [...rowsMap.entries()]
      .map(([name, info]) => ({ name, cells: info.cells }))
      // most active item first (milk normally tops the list), then alphabetical
      .sort((a, b) => (rowsMap.get(b.name).count || 0) - (rowsMap.get(a.name).count || 0) || a.name.localeCompare(b.name));

    res.json({
      tz: TZ,
      filter: q || null,
      weekOffset,
      weekStart: iso(weekStartDate),
      dates,
      rows
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/feeds?day=N
// day: how many record-days to skip back from the most recent one (only days
// that have records are listed). With a name filter, only carts containing the
// item appear and volumes cover just that item; otherwise all sessions of the
// day are listed.
router.get('/feeds', async (req, res, next) => {
  try {
    const { q, nameCond, nameParams, ql } = parseQ(req);
    const dayOffset = Math.max(0, Math.min(730, parseInt(req.query.day, 10) || 0));
    const { windowMinutes, windowMs } = cartWindow();
    const now = localNow();
    const { from: monthFrom } = monthHorizon(now);

    const [[latestDayRow]] = await db.query(
      `SELECT DATE(consumption_time) AS d FROM consumption_history WHERE 1=1${nameCond}
       GROUP BY d ORDER BY d DESC LIMIT 1 OFFSET ?`,
      [...nameParams, dayOffset]
    );
    if (!latestDayRow) {
      return res.json({
        tz: TZ,
        filter: q || null,
        dayOffset,
        cartWindowMinutes: windowMinutes,
        date: null,
        rows: []
      });
    }

    const day = String(latestDayRow.d);
    const carts = await buildCarts(monthFrom, windowMs);
    const sourceCarts = ql
      ? carts.filter((c) => c.items.some((it) => it.name.toLowerCase() === ql))
      : carts;
    const dayCarts = sourceCarts.filter((c) => String(c.start).slice(0, 10) === day);
    const rows = dayCarts.map((c) => {
      const items = ql ? c.items.filter((it) => it.name.toLowerCase() === ql) : c.items;
      return {
        time: String(c.start).slice(11, 16),
        byUnit: sumUnits(items),
        items: [...new Set(c.items.map((i) => i.name))]
      };
    });

    res.json({
      tz: TZ,
      filter: q || null,
      dayOffset,
      cartWindowMinutes: windowMinutes,
      date: day,
      rows
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary/daily?q=
// Last 30 wall-clock days as continuous buckets (zeros filled), for one exact
// item or all items — powers the dashboard's 30-day milk volumes chart.
router.get('/daily', async (req, res, next) => {
  try {
    const { q, nameCond, nameParams } = parseQ(req);
    const now = localNow();
    const dayStart = addDays(new Date(iso(now) + 'T00:00:00Z'), -29);
    const [dailyRaw] = await db.query(
      `SELECT DATE(consumption_time) AS d, measurement AS unit,
              SUM(amount) AS total, COUNT(*) AS c
       FROM consumption_history
       WHERE consumption_time >= ?${nameCond}
       GROUP BY d, unit`,
      [iso(dayStart) + ' 00:00:00', ...nameParams]
    );
    const days = fillBuckets(
      spanDates(dayStart, now, (d) => iso(d)),
      groupBy(dailyRaw, 'd')
    ).map(({ date, count, byUnit }) => ({ date, count, byUnit }));
    res.json({ tz: TZ, filter: q || null, days });
  } catch (err) {
    next(err);
  }
});

/* ---------- helpers ---------- */

// Dummy-UTC wall-clock dates: Date objects whose UTC fields hold the
// APP_TIMEZONE wall-clock values, so ISO strings read back exactly what a
// user would call the date.
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function parseQ(req) {
  const q = String(req.query.q || '').trim();
  return {
    q,
    nameCond: q ? ' AND name = ?' : '',
    nameParams: q ? [q] : [],
    ql: q.toLowerCase()
  };
}

function cartWindow() {
  const windowMinutes = Number(process.env.CART_WINDOW_MINUTES || 15) || 15;
  return { windowMinutes, windowMs: windowMinutes * 60 * 1000 };
}

// Chronological walk; a new cart starts when the gap to the previous record
// exceeds windowMs.
async function buildCarts(horizonISO, windowMs) {
  const [rows] = await db.query(
    `SELECT id, name, amount, measurement, consumption_time
     FROM consumption_history
     WHERE consumption_time >= ?
     ORDER BY consumption_time ASC, id ASC`,
    [horizonISO]
  );
  const carts = [];
  for (const r of rows) {
    const t = new Date(String(r.consumption_time).replace(' ', 'T') + 'Z');
    const item = { id: r.id, name: r.name, amount: Number(r.amount), unit: r.measurement };
    const last = carts[carts.length - 1];
    if (last && t - last._start <= windowMs) {
      last.items.push(item);
      last.end = String(r.consumption_time);
    } else {
      carts.push({
        _start: t,
        start: String(r.consumption_time),
        end: String(r.consumption_time),
        key: cartKey(t),
        items: [item]
      });
    }
  }
  return carts;
}

// last 6 calendar months (keys like 2026-05) and their shared FROM boundary
function monthHorizon(now) {
  const keys = [];
  for (let i = 5; i >= 0; i--) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(iso(t).slice(0, 7));
  }
  return { keys, from: keys[0] + '-01 00:00:00' };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sumUnits(items) {
  const byUnit = {};
  for (const it of items) byUnit[it.unit] = round2((byUnit[it.unit] || 0) + it.amount);
  return byUnit;
}

function groupBy(rows, dimKey) {
  const out = new Map();
  for (const r of rows) {
    const key = String(r[dimKey]);
    if (!out.has(key)) out.set(key, { count: 0, byUnit: {} });
    const bucket = out.get(key);
    bucket.count += Number(r.c);
    bucket.byUnit[r.unit] = round2((bucket.byUnit[r.unit] || 0) + Number(r.total));
  }
  return out;
}

function spanDates(start, end, keyFn) {
  const keys = [];
  const base = new Date(iso(start) + 'T00:00:00Z');
  const lastKey = iso(end);
  for (let d = base; iso(d) <= lastKey; d = addDays(d, 1)) keys.push(keyFn(d));
  return keys;
}

const emptyBucket = () => ({ count: 0, byUnit: {} });

function fillBuckets(keys, map) {
  return keys.map((k) => ({ ...(map.get(k) || emptyBucket()), date: k }));
}

function fillWeeks(keys, map) {
  return keys.map((key) => ({
    key,
    ...(map.get(String(key.slice(0, 4) + String(parseInt(key.slice(6), 10)).padStart(2, '0'))) || {})
  }));
}

function fillMonths(keys, map) {
  return keys.map((key) => ({ key, ...(map.get(key) || {}) }));
}

// carts -> weekly/monthly rollups keyed by the cart's start time
function fillContainers(keys, carts, dim) {
  const map = new Map(keys.map((k) => [k, { carts: 0, items: 0, byUnit: {} }]));
  for (const c of carts) {
    const key =
      dim === 'wk'
        ? isoWeekKey(c._start)
        : c._start.getUTCFullYear() + '-' + String(c._start.getUTCMonth() + 1).padStart(2, '0');
    const bucket = map.get(key);
    if (!bucket) continue; // cart before summary horizon
    bucket.carts += 1;
    bucket.items += c.items.length;
    for (const it of c.items) bucket.byUnit[it.unit] = round2((bucket.byUnit[it.unit] || 0) + it.amount);
  }
  return keys.map((key) => ({ key, ...(map.get(key) || {}) }));
}

function isoWeekStart(d) {
  const date = new Date(iso(d) + 'T00:00:00Z');
  const day = date.getUTCDay() || 7; // Mon = 1 ... Sun = 7
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
}

// ISO-8601 week number: Thursday-based, handles year rollover correctly.
function isoWeekInfo(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday of this ISO week
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3); // Thursday of ISO week 1
  const week = 1 + Math.round((date.getTime() - jan4.getTime()) / (7 * 86400000));
  return { year: isoYear, week };
}

function isoWeekNum(d) {
  return isoWeekInfo(d).week;
}

function isoWeekKey(d) {
  const { year, week } = isoWeekInfo(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function cartKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function sumDaily(list) {
  const out = { count: 0, byUnit: {} };
  for (const b of list) {
    out.count += b.count || 0;
    for (const [u, v] of Object.entries(b.byUnit || {})) out.byUnit[u] = round2((out.byUnit[u] || 0) + v);
  }
  return out;
}

module.exports = router;