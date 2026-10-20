// Database connection pool. All config comes from .env (see .env.example).
//
// NOTE on dates: consumption_history stores datetimes as raw wall-clock values
// exactly as the user entered them (e.g. "2026-10-07 09:00:00"). We therefore
// read dates as STRINGS (dateStrings: true) and never let the driver convert
// them through a timezone, so what you see is what was entered.
//
// created_at is written with UTC_TIMESTAMP() to match the existing rows, which
// were stored with the database server's UTC clock.

const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  dateStrings: true // "YYYY-MM-DD HH:mm:ss" as-is, no TZ conversion
};

module.exports = mysql.createPool(config);