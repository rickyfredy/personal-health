require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const db = require('./db');
const { bootstrap } = require('./bootstrap');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const consumptionRoutes = require('./routes/consumption');
const summaryRoutes = require('./routes/summary');
const ngtRoutes = require('./routes/ngt');

const PORT = Number(process.env.PORT || 3001);
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

async function main() {
  await bootstrap();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const sessionStore = new MySQLStore(
    {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000
    },
    db // reuse the pool, no second pool
  );

  app.use(
    session({
      name: 'callista.sid',
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'change-me-in-env',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: (Number(process.env.SESSION_TTL_HOURS || 72) || 72) * 3600 * 1000
      }
    })
  );

  app.use('/api/auth', authRoutes); // login/logout/me - no guard (guard applied inside)
  app.use('/api/summary', requireAuth, summaryRoutes);
  app.use('/api/consumptions', requireAuth, consumptionRoutes);
  app.use('/api/ngt', requireAuth, ngtRoutes);

  // Built frontend (npm run build in ../client) served from the same port.
  app.use(express.static(CLIENT_DIST, { maxAge: '1h' }));

  // SPA fallback: any non-API GET serves the app shell.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Callista health-history API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});