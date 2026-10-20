// Simple session guard: every /api route except /api/auth/* requires a login.
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

module.exports = { requireAuth };