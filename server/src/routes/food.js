const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const db = require('../db');

const execFileP = promisify(execFile);

const router = express.Router();

// "Food Report" page data. The external dietary assistant owns two tables
// (the app is a pure READER here, it never writes):
//   meal_sessions — one row per eating session: meal_type enum
//     (breakfast|lunch|dinner|snack), consumption_time = the meal's
//     wall-clock moment, created_at = logging moment.
//   meal_photos   — one row PER MEDIA FILE: session_id (FK -> meal_sessions,
//     ON DELETE CASCADE), photo_path = server file path of the inbound photo
//     or video, created_at.
// A session may carry several files; we return every row in one flat,
// newest-meal-first list — the page shows all images, no grouping. A row
// may be an IMAGE or a VIDEO (mp4/mov/webm/...): the list includes its
// `media` kind, videos get ffmpeg-extracted thumbnails (.thumbs cache) and
// play inline in the lightbox via /photo/:id. Sessions without media rows
// simply produce nothing here.

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', '3gp']);
// Disk cache for extracted video frames (git-ignored).
const THUMB_DIR = path.resolve(__dirname, '../thumbs');

function mediaKind(file) {
  return VIDEO_EXT.has(path.extname(file).slice(1).toLowerCase()) ? 'video' : 'image';
}

// Extract one representative frame (~1/3 into the runtime) with ffmpeg and
// cache it on disk. First run per video costs one ffprobe + one ffmpeg call;
// later requests serve the cached jpg.
async function ensureVideoThumb(id, file) {
  const thumb = path.join(THUMB_DIR, `v${id}.jpg`);
  if (fs.existsSync(thumb)) return thumb;

  await fs.promises.mkdir(THUMB_DIR, { recursive: true });
  const tmp = path.join(THUMB_DIR, `v${id}.tmp.jpg`);

  let offset = 1; // ~1s in — the safe default when ffprobe can't tell the duration
  try {
    const { stdout } = await execFileP(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { timeout: 20000 }
    );
    const dur = parseFloat(String(stdout).trim().split(/\s+/)[0]);
    if (Number.isFinite(dur) && dur > 0.5) {
      offset = Math.min(Math.max(dur * 0.3, 0.1), Math.max(dur - 0.2, 0.1));
    }
  } catch {
    /* no ffprobe / unreadable duration — keep the 1s offset */
  }

  try {
    await execFileP(
      'ffmpeg', ['-y', '-ss', String(offset), '-i', file, '-frames:v', '1', '-q:v', '3', tmp],
      { timeout: 60000 }
    );
  } catch {
    // the seeked frame may not exist on very short clips — fall back to frame 0
    await execFileP(
      'ffmpeg', ['-y', '-i', file, '-frames:v', '1', '-q:v', '3', tmp],
      { timeout: 60000 }
    );
  }
  await fs.promises.rename(tmp, thumb); // atomic: no half-written thumbnails cached
  return thumb;
}

router.get('/', async (req, res, next) => {
  try {
    // cap raised to 2000 so client-side 100-per-page paging keeps seeing all
    // media as history grows (rows are tiny metadata; files come separately)
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 2000));
    const [rows] = await db.query(
      `SELECT p.id, p.session_id, s.meal_type AS meal, s.consumption_time AS taken_at,
              p.photo_path, p.created_at
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
        created_at: r.created_at,
        media: mediaKind(r.photo_path)
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/food/photo/:id -> the media bytes referenced by the row.
// sendFile supports HTTP Range, so videos can be seeked/streamed by the player.
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

// GET /api/food/thumb/:id -> tile-size still for the gallery. Images pass
// through as-is (sized by CSS); videos get a cached ffmpeg frame, generated
// on first request. On ffmpeg failure the client's onError swaps a blank.
router.get('/thumb/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[row]] = await db.query('SELECT photo_path FROM meal_photos WHERE id = ?', [id]);
    if (!row || !row.photo_path) return res.status(404).json({ error: 'Photo not found.' });
    const file = row.photo_path;
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Photo file missing.' });

    if (mediaKind(file) === 'image') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(path.extname(file).slice(1) || 'jpeg');
      return res.sendFile(file);
    }

    const thumb = await ensureVideoThumb(id, file);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('jpg');
    res.sendFile(thumb);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
