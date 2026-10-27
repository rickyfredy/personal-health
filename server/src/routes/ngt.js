const express = require('express');
const db = require('../db');

const router = express.Router();

// NGT tube changes are recorded in the ngt_history table, written by an
// external channel (not by this app). Here we only read them:
// GET /api/ngt/changes?page=N -> newest first, 5 per page.
router.get('/changes', async (req, res, next) => {
  try {
    const pageSize = 5;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM ngt_history');
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);

    const [rows] = await db.query(
      `SELECT id, measurement, consumption_time, created_at
       FROM ngt_history
       ORDER BY consumption_time DESC, id DESC
       LIMIT ? OFFSET ?`,
      [pageSize, (safePage - 1) * pageSize]
    );

    res.json({ rows, total, page: safePage, pageSize, pages });
  } catch (err) {
    next(err);
  }
});

module.exports = router;