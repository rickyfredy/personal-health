const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/labs?q=<title contains>&abnormal=1&limit=N(default 500, cap 1000)
// Metadata list, newest first (the UI filters further client-side).
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const abnormalOnly = req.query.abnormal === '1';
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500));

    const where = [];
    const params = [];
    if (q && String(q).trim()) {
      where.push('title LIKE ?');
      params.push(`%${String(q).trim()}%`);
    }
    if (abnormalOnly) where.push('abnormal = 1');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[stats]] = await db.query(
      `SELECT COUNT(*) AS total, SUM(abnormal) AS abnormalTotal
       FROM lab_reports ${whereSql}`,
      params
    );
    const [reports] = await db.query(
      `SELECT id, ext_id, title, reported_at, order_facility, perform_facility,
              abnormal, abnormal_count
       FROM lab_reports ${whereSql}
       ORDER BY reported_at DESC, id DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json({
      total: Number(stats.total),
      abnormalTotal: Number(stats.abnormalTotal || 0),
      reports
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/labs/:id/rows -> the test rows of one report
router.get('/:id/rows', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await db.query(
      `SELECT seq, test, result, ref, comments, abnormal
       FROM lab_result_rows WHERE report_id = ? ORDER BY seq`,
      [id]
    );
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;