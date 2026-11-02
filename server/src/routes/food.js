const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// Meal photos ("Food Report" page). Files live on disk under uploads/food,
// metadata in the food_photos table. Photos are typically uploaded from the
// app, but any external channel may INSERT into the table too.
const DIR = path.resolve(__dirname, '../uploads/food');
fs.mkdirSync(DIR, { recursive: true });

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const [rows] = await db.query(
      `SELECT id, meal, taken_at, original_name, created_at
       FROM food_photos
       ORDER BY taken_at DESC, id DESC
       LIMIT ?`,
      [limit]
    );
    res.json({ total: rows.length, photos: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/food { meal: 'lunch'|'dinner'|'snack', taken_at: 'YYYY-MM-DDTHH:mm',
//                  dataUrl: 'data:image/jpeg;base64,...' }
router.post('/', async (req, res, next) => {
  try {
    const { meal, taken_at, dataUrl } = req.body || {};
    if (!['lunch', 'dinner', 'snack'].includes(meal)) {
      return res.status(400).json({ error: 'Meal must be lunch, dinner or snack.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(taken_at || ''))) {
      return res.status(400).json({ error: 'Pick a valid date and time.' });
    }
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Attach an image.' });
    }
    const m = /^data:(image\/(jpeg|png|webp|gif|heic|heif));base64,([\s\S]+)$/.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'Unsupported image type. Use jpeg, png, webp, gif or heic.' });

    const ext = m[2].replace('jpeg', 'jpg');
    const storedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(DIR, storedName), Buffer.from(m[3], 'base64'));

    const [result] = await db.query(
      `INSERT INTO food_photos (meal, taken_at, stored_name, original_name, created_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [meal, taken_at.replace('T', ' ') + ':00', storedName, null]
    );
    res.status(201).json({ id: result.insertId, meal, taken_at: taken_at.replace('T', ' ') + ':00' });
  } catch (err) {
    next(err);
  }
});

// GET /api/food/photo/:id -> the image bytes (auth happens via the guard)
router.get('/photo/:id', async (req, res, next) => {
  try {
    const [[row]] = await db.query('SELECT stored_name FROM food_photos WHERE id = ?', [
      parseInt(req.params.id, 10)
    ]);
    if (!row) return res.status(404).json({ error: 'Photo not found.' });
    const file = path.join(DIR, path.basename(row.stored_name)); // basename: no traversal
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'File missing.' });
    res.type(path.extname(file).slice(1) || 'jpeg');
    res.sendFile(file);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/food/:id -> remove row + file
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[row]] = await db.query('SELECT stored_name FROM food_photos WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Photo not found.' });
    await db.query('DELETE FROM food_photos WHERE id = ?', [id]);
    const file = path.join(DIR, path.basename(row.stored_name));
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;