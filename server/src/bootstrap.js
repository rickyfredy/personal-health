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
  // Collation omitted so each server applies its own default.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ngt_history (
      id INT NOT NULL AUTO_INCREMENT,
      measurement DECIMAL(4,2) NULL,
      consumption_time DATETIME NULL,
      created_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Medical records imported from HealthHub exports (see ingest-healthhub.js).
  // ext_id = the export's dedupe key, so re-importing an export updates
  // instead of duplicating.
  await db.query(`
    CREATE TABLE IF NOT EXISTS lab_reports (
      id INT NOT NULL AUTO_INCREMENT,
      ext_id VARCHAR(200) NOT NULL,
      title VARCHAR(120) NOT NULL,
      reported_at DATETIME NULL,
      order_facility VARCHAR(60) NULL,
      perform_facility VARCHAR(60) NULL,
      abnormal TINYINT(1) NOT NULL DEFAULT 0,
      abnormal_count INT NOT NULL DEFAULT 0,
      remarks TEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_lab_reports_ext (ext_id),
      KEY ix_lab_reports_date (reported_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS lab_result_rows (
      id INT NOT NULL AUTO_INCREMENT,
      report_id INT NOT NULL,
      seq INT NULL,
      test VARCHAR(150) NOT NULL DEFAULT '',
      result VARCHAR(255) NULL,
      ref VARCHAR(120) NULL,
      comments TEXT NULL,
      abnormal TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY ix_lab_rows_report (report_id),
      KEY ix_lab_rows_test (test(50)),
      CONSTRAINT fk_lab_rows_report FOREIGN KEY (report_id) REFERENCES lab_reports (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS discharge_records (
      id INT NOT NULL AUTO_INCREMENT,
      ext_id VARCHAR(200) NOT NULL,
      venue VARCHAR(60) NULL,
      list_date DATETIME NULL,
      admitted_at DATETIME NULL,
      discharged_at DATETIME NULL,
      location VARCHAR(80) NULL,
      specialty VARCHAR(80) NULL,
      doctor_name VARCHAR(120) NULL,
      doctor_mcr VARCHAR(20) NULL,
      account VARCHAR(40) NULL,
      mrn VARCHAR(40) NULL,
      patient_name VARCHAR(120) NULL,
      primary_dx TEXT NULL,
      secondary_dx TEXT NULL,
      allergy TEXT NULL,
      alert TEXT NULL,
      procedures LONGTEXT NULL,
      rx_text LONGTEXT NULL,
      details LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_discharge_ext (ext_id),
      KEY ix_discharge_date (discharged_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { bootstrap };