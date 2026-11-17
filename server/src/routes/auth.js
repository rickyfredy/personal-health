const express = require('express');
const db = require('../db');
const { verifyPassword } = require('../password');

const router = express.Router();

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Enter both username and password.' });
    }

    const [rows] = await db.query('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1', [
      String(username).trim()
    ]);
    const user = rows[0];

    // Same generic message either way, so we don't reveal which field was wrong.
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ username: user.username });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me -> current user or 401
router.get('/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ username: req.session.username });
  }
  return res.status(401).json({ error: 'Not logged in' });
});

module.exports = router;