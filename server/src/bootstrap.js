// One-time setup on server start: creates the users table (login only),
// seeds the default admin account when it doesn't exist, and creates the
// ngt_history table (read by the dashboard; written by an external channel).
// The existing consumption_history table is never modified here.
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEFAULT_USER = process.env.DEFAULT_USERNAME || 'admin';
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'admin';

async function bootstrap() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  const [rows] = await db.query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n === 0) {
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    await db.query('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [
      DEFAULT_USER,
      hash
    ]);
    console.log(`[bootstrap] created default user "${DEFAULT_USER}"`);
  }

  // NGT tube changes: written by an external channel, which uses this exact
  // shape (measurement = tube size, consumption_time = when it was changed).
  // Collation omited so each server applies its own default.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ngt_history (
      id INT NOT NULL AUTO_INCREMENT,
      measurement DECIMAL(4,2) NULL,
      consumption_time DATETIME NULL,
      created_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { bootstrap };