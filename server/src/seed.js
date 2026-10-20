// Seeds realistic sample data so the 7-day list and dashboards have history.
//
// Rules:
// - ADDITIVE ONLY: never touches or deletes existing rows.
// - Idempotent: records a run in a small seed_meta table and refuses to run
//   twice unless --force is passed.
//
// Usage:  node server/src/seed.js [--force]

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const db = require('./db');

const SEED_DAYS = 55; // days of history back from "today" in APP_TIMEZONE
const NAMES = [
  { name: 'Peptamen junior', amount: 100, measurement: 'ml', perDay: 3, delta: 0 },
  { name: 'Liver vitamin', amount: 5, measurement: 'ml', perDay: 1, delta: 0 },
  { name: 'Multivitamin', amount: 1, measurement: 'ml', perDay: 1, delta: 0 },
  { name: 'Immun forte', amount: 10, measurement: 'ml', perDay: 1, delta: 2 },
  { name: 'Fish oil', amount: 2.5, measurement: 'ml', perDay: 0.7, delta: 0.5 },
  { name: 'Antibiotik', amount: 5, measurement: 'ml', perDay: 0.3, delta: 0 } // occasional course
];

// Deterministic pseudo-random so seeding looks hand-done but repeatable.
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}

const localToday = (() => {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Singapore',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  return new Date(parts + 'T00:00:00Z');
})();

async function main() {
  const force = process.argv.includes('--force');

  await db.query(`
    CREATE TABLE IF NOT EXISTS seed_meta (
      id INT NOT NULL AUTO_INCREMENT,
      run_at DATETIME NOT NULL,
      rows_added INT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [[meta]] = await db.query(
    'SELECT COUNT(*) AS seeds FROM seed_meta'
  );
  if (meta.seeds > 0 && !force) {
    console.log('Seed already ran before (seed_meta has an entry). Use --force to add more.');
    process.exit(0);
  }

  const rows = [];
  for (let dayN = SEED_DAYS; dayN >= 8; dayN--) {
    const day = new Date(localToday.getTime() - dayN * 86400000);
    if (day.getUTCDay() === 0) continue; // quieter Sundays

    for (const spec of NAMES) {
      if (rand() > spec.perDay) continue;
      // skip "Antibiotik" after the first 10 days of the window (course ended)
      if (spec.name === 'Antibiotik' && dayN < SEED_DAYS - 10) continue;

      const times = ['09:05', '12:30', '17:10'];
      const t = times[Math.floor(rand() * times.length)];
      const jitter = Math.floor(rand() * 7) - 3; // +/- minutes
      const baseMin = parseInt(t.slice(3, 5), 10);
      const mm = String(baseMin + jitter).padStart(2, '0');
      const date = day.toISOString().slice(0, 10);
      const time = `${date} ${t.slice(0, 3)}${mm}:00`;
      const amount = Math.round((spec.amount + (rand() - 0.5) * spec.delta) * 100) / 100;

      rows.push([spec.name, Math.max(0.5, amount), spec.measurement, time]);
    }
  }

  let added = 0;
  for (const r of rows) {
    await db.query(
      'INSERT INTO consumption_history (name, amount, measurement, consumption_time, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
      r
    );
    added++;
  }

  await db.query('INSERT INTO seed_meta (run_at, rows_added) VALUES (UTC_TIMESTAMP(), ?)', [added]);
  console.log(`Seeded ${added} sample rows ending just before your existing data. Done.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});