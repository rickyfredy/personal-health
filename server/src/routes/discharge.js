const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/discharge?limit=N (default 100, cap 200)
// All discharge summaries, newest discharge first. Fields are pre-flattened
// for the UI; details/rx_text carry the full source content for the expand view.
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const [[stats]] = await db.query('SELECT COUNT(*) AS total FROM discharge_records');
    const [records] = await db.query(
      `SELECT id, ext_id, venue, admitted_at, discharged_at, location, specialty,
              doctor_name, doctor_mcr, account, mrn, patient_name,
              primary_dx, secondary_dx, allergy, alert, procedures, rx_text, details
       FROM discharge_records
       ORDER BY discharged_at DESC, id DESC
       LIMIT ?`,
      [limit]
    );
    // parse the stored JSON blobs so the client gets objects, not strings;
    // the raw details blob itself is not shipped to the client
    for (const r of records) {
      let details = {};
      try { details = r.details ? JSON.parse(r.details) : {}; } catch { details = {}; }
      r.clinical = Array.isArray(details.ClinicalSummaries) ? details.ClinicalSummaries : [];
      delete r.details;
      try { r.procedures = r.procedures ? JSON.parse(r.procedures) : []; } catch { r.procedures = []; }
      try { r.allergy = r.allergy ? JSON.parse(r.allergy) : []; } catch { r.allergy = []; }
      try { r.alert = r.alert ? JSON.parse(r.alert) : []; } catch { r.alert = []; }
    }

    res.json({ total: Number(stats.total), records });
  } catch (err) {
    next(err);
  }
});

module.exports = router;