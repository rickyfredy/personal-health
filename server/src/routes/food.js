const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

// "Food Report" page data. The external dietary assistant owns two tables
// (the app is a pure READER here, it never writes):
//   meal_sessions — one row per eating session: meal_type enum
//     (breakfast|lunch|dinner|snack), consumption_time = the meal's
//     wall-clock moment, created_at = logging moment.
//   meal_photos   — one row PER IMAGE: session_id (FK -> meal_sessions,
//     ON DELETE CASCADE), photo_path = server file path of the inbound
//     photo, created_at.
// A session may carry several photos; we return every image row in one
// flat, newest-meal-first list — the page shows all images, no grouping.
// Sessions without photos simply produce nothing here.

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const [rows] = await db.query(
      `SELECT p.id, p.session_id, s.meal_type AS meal, s.consumption_time AS taken_at, p.created_at
       FROM meal_photos p
       LEFT JOIN meal_sessions s ON s.id = p.session_id
       ORDER BY COALESCE(s.consumption_time, p.created_at) DESC, p.session_id DESC, p.id DESC
       LIMIT ?`,
      [limit]
    );
    res.json({
      total: rows.length,
      photos: rows.map((r) => ({
        id: r.id,
        session_id: r.session_id,
        meal: r.meal,
        taken_at: r.taken_at,
        created_at: r.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/food/photo/:id -> the image bytes referenced by the row
router.get('/photo/:id', async (req, res, next) => {
  try {
    const [[row]] = await db.query('SELECT photo_path FROM meal_photos WHERE id = ?', [
      parseInt(req.params.id, 10)
    ]);
    if (!row || !row.photo_path) return res.status(404).json({ error: 'Photo not found.' });
    const file = row.photo_path;
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Photo file missing.' });
    res.type(path.extname(file).slice(1) || 'jpeg');
    res.sendFile(file);
  } catch (err) {
    next(err);
  }
});

module.exports = router;