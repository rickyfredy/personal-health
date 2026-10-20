const express = require('express');
const db = require('../db');
const { localNow } = require('../time');

const router = express.Router();

/* Ordering rule (from the brief): records are ordered by consumption_time DESC,
 * with id DESC as a tie-breaker so rows entered within the same minute stay
 * in a stable, newest-first order.
 *
 * "Change the order": the order key IS consumption_time, so re-ordering works
 * by adjusting that field —
 *   1. Edit a record's consumption_time directly (edit form), or
 *   2. Use the up/down arrows: the record's time is nudged relative to the
 *      neighbouring record in the sorted list (see POST /:id/move).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function validate(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const amount = Number(body.amount);
  const measurement = String(body.measurement || '').trim();
  const time = String(body.consumption_time || '').trim();

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 50) errors.name = 'Max 50 characters.';
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Amount must be a positive number.';
  else if (amount > 999999) errors.amount = 'Too large.';
  if (!measurement) errors.measurement = 'Unit is required.';
  else if (measurement.length > 10) errors.measurement = 'Max 10 characters.';
  if (!DATETIME_RE.test(time)) errors.consumption_time = 'Pick a date and time.';
  else {
    const d = new Date(time + ':00');
    if (Number.isNaN(d.getTime())) errors.consumption_time = 'Invalid date.';
  }

  return { errors, values: { name, amount, measurement, time: time.replace('T', ' ') + ':00' } };
}

// GET /api/consumptions/meta -> options for the filter bars
router.get('/meta', async (req, res, next) => {
  try {
    const [units] = await db.query(
      'SELECT measurement AS unit, COUNT(*) AS n FROM consumption_history GROUP BY measurement ORDER BY unit'
    );
    const [names] = await db.query('SELECT DISTINCT name FROM consumption_history ORDER BY name');
    // Suggested default for the dashboard filter (.env DEFAULT_DASHBOARD_ITEM),
    // resolved case-insensitively against existing names.
    const envItem = String(process.env.DEFAULT_DASHBOARD_ITEM || '').trim().toLowerCase();
    const defaultItem = envItem
      ? names.find((r) => r.name.toLowerCase() === envItem)?.name || null
      : null;
    res.json({ units, names: names.map((r) => r.name), defaultItem });
  } catch (err) {
    next(err);
  }
});

// GET /api/consumptions
//  ?range=7d|30d|all|custom&from&to&q=<name contains>&unit=ml&
//   page=1&pageSize=10&sort=consumption_time|name|amount&dir=asc|desc
router.get('/', async (req, res, next) => {
  try {
    const { range = '7d', from, to, q, unit } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize, 10) || 10));
    const sort = ['consumption_time', 'name', 'amount'].includes(req.query.sort) ? req.query.sort : 'consumption_time';
    const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    const where = [];
    const params = [];

    if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      const start = localNow(); // wall-clock "now" in APP_TIMEZONE
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      where.push('consumption_time >= ?');
      params.push(fmt(start));
    } else if (range === 'custom') {
      if (DATE_RE.test(from || '')) {
        where.push('consumption_time >= ?');
        params.push(`${from} 00:00:00`);
      }
      if (DATE_RE.test(to || '')) {
        where.push('consumption_time <= ?');
        params.push(`${to} 23:59:59`);
      }
    } // 'all' -> no date clause

    if (q && String(q).trim()) {
      where.push('name LIKE ?');
      params.push(`%${String(q).trim()}%`);
    }
    if (unit && String(unit).trim()) {
      where.push('measurement = ?');
      params.push(String(unit).trim());
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM consumption_history ${whereSql}`,
      params
    );
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * pageSize;

    const [rows] = await db.query(
      `SELECT id, name, amount, measurement, consumption_time, created_at
       FROM consumption_history ${whereSql}
       ORDER BY ${sort} ${dir}, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ rows, total, page: safePage, pageSize, pages });
  } catch (err) {
    next(err);
  }
});

// POST /api/consumptions
router.post('/', async (req, res, next) => {
  try {
    const { errors, values } = validate(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const [result] = await db.query(
      `INSERT INTO consumption_history (name, amount, measurement, consumption_time, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [values.name, values.amount, values.measurement, values.time]
    );
    const [[row]] = await db.query('SELECT * FROM consumption_history WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// PUT /api/consumptions/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[existing]] = await db.query('SELECT id FROM consumption_history WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    const { errors, values } = validate(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    await db.query(
      `UPDATE consumption_history SET name = ?, amount = ?, measurement = ?, consumption_time = ? WHERE id = ?`,
      [values.name, values.amount, values.measurement, values.time, id]
    );
    const [[row]] = await db.query('SELECT * FROM consumption_history WHERE id = ?', [id]);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/consumptions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [result] = await db.query('DELETE FROM consumption_history WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Record not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/consumptions/:id/move  { direction: "up" | "down" }
// "up"  = towards the top of the (consumption_time DESC) list  = newer
// "down" = towards the bottom                                   = older
// If the times are strictly ordered the two rows simply swap times; on an
// exact tie the record is nudged one minute past its neighbour, which also
// breaks the tie so the move is always visible.
router.post('/:id/move', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const direction = req.body && req.body.direction === 'up' ? 'up' : 'down';

    // Global list in canonical order, ignoring the current search/filter so
    // arrows always move against the real order.
    const [all] = await db.query(
      'SELECT id, consumption_time FROM consumption_history ORDER BY consumption_time DESC, id DESC'
    );
    if (!all.length) return res.status(404).json({ error: 'Record not found.' });
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found.' });

    const neighbourIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (neighbourIdx < 0 || neighbourIdx >= all.length) {
      return res.status(400).json({ error: `Already at the ${direction === 'up' ? 'top' : 'bottom'}.` });
    }

    const mine = all[idx];
    const neighbour = all[neighbourIdx];
    const t = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
    const MIN = 60 * 1000;

    let newTime;
    const orderedNoWait = direction === 'up' ? t(neighbour.consumption_time) > t(mine.consumption_time)
      : t(neighbour.consumption_time) < t(mine.consumption_time);

    if (orderedNoWait) {
      // strictly ordered neighbour: swap the two times
      newTime = neighbour.consumption_time;
      await db.query('UPDATE consumption_history SET consumption_time = ? WHERE id = ?', [
        mine.consumption_time,
        neighbour.id
      ]);
    } else {
      // tie (or out of order): nudge one minute past the neighbour
      const target = t(neighbour.consumption_time) + (direction === 'up' ? MIN : -MIN);
      newTime = new Date(target).toISOString().replace('T', ' ').slice(0, 19);
    }
    await db.query('UPDATE consumption_history SET consumption_time = ? WHERE id = ?', [newTime, id]);

    const [[row]] = await db.query('SELECT * FROM consumption_history WHERE id = ?', [id]);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

function fmt(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = router;