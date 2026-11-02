const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/timeline -> care-timeline data for the dashboard graph:
//   crp:        C-Reactive Protein results over time (numeric values only)
//   admissions: hospital admission moments (discharge data)
//   discharges: hospital discharge moments (discharge data)
// All timestamps are epoch ms derived from the wall-clock values as stored.
const toTs = (s) => {
  if (!s) return null;
  const t = Date.parse(String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? null : t;
};

router.get('/', async (req, res, next) => {
  try {
    const [crpRows] = await db.query(
      `SELECT lr.id, lr.reported_at, lr.title, r.result, r.ref, r.abnormal
       FROM lab_result_rows r
       JOIN lab_reports lr ON lr.id = r.report_id
       WHERE r.test LIKE '%C-Reactive Protein%'
       ORDER BY lr.reported_at ASC, r.seq ASC`
    );
    const crp = [];
    for (const r of crpRows) {
      const ts = toTs(r.reported_at);
      if (ts === null) continue;
      const m = /^-?\d+(\.\d+)?/.exec(String(r.result || '').replace(',', '.'));
      if (!m) continue; // skip textual results
      crp.push({
        ts,
        value: Number(m[0]),
        ref: r.ref || null,
        abnormal: !!r.abnormal,
        title: r.title
      });
    }

    const [admRows] = await db.query(
      'SELECT DISTINCT admitted_at FROM discharge_records WHERE admitted_at IS NOT NULL AND admitted_at NOT LIKE \'0000%\' ORDER BY admitted_at'
    );
    const [disRows] = await db.query(
      'SELECT DISTINCT discharged_at FROM discharge_records WHERE discharged_at IS NOT NULL AND discharged_at NOT LIKE \'0000%\' ORDER BY discharged_at'
    );

    res.json({
      crp,
      admissions: admRows.map((r) => toTs(r.admitted_at)).filter(Boolean),
      discharges: disRows.map((r) => toTs(r.discharged_at)).filter(Boolean)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;