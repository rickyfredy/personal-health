const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

// "Food Report" page data. Rows come from the meal_photos table, which the
// external channel (the dietary assistant) writes: meal_type enum
// (breakfast|lunch|dinner|snack), photo_path = server file path of the
// inbound photo, consumption_time = the meal's wall-clock moment.
// The app is a READER here; it never writes.

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const [rows] = await db.query(
      `SELECT id, meal_type, photo_path, consumption_time, created_at
       FROM meal_photos
       ORDER BY consumption_time DESC, id DESC
       LIMIT ?`,
      [limit]
    );
    res.json({
      total: rows.length,
      photos: rows.map((r) => ({
        id: r.id,
        meal: r.meal_type,
        taken_at: r.consumption_time,
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