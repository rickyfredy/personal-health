// Imports HealthHub exports (JSON) into the medical-record tables.
//
// Usage:  node src/ingest-healthhub.js <export1.json> [export2.json ...]
//
// Accepts any mix of the two export kinds; the kind is detected from the
// top-level shape:
//   { patient, generated, source, reports: [...] }  -> Lab Results
//   { records: [...] }                              -> Discharge Summaries
//
// Idempotent: each report/record carries the export's dedupe key (ext_id);
// re-importing updates the existing row (and replaces a lab report's rows)
// instead of duplicating. created_at tracks the LAST import, so a later
// refresh touches nothing if the source is unchanged.

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const db = require('./db');
const { bootstrap } = require('./bootstrap');

const normWhen = (s) => {
  if (!s) return null;
  // "2026-09-16T13:42:00+08:00" / "2026-07-18T18:04:41" -> "2026-09-16 13:42:00"
  return String(s).replace('T', ' ').slice(0, 19);
};

async function ingestLabs(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const reports = j.reports || [];
  const chunkSize = 100;

  // 1. upsert report metadata in multi-row batches
  for (let i = 0; i < reports.length; i += chunkSize) {
    const chunk = reports.slice(i, i + chunkSize);
    const rowsSql = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())').join(', ');
    const params = [];
    for (const r of chunk) {
      const when = normWhen(r.dateISO) || normWhen(r.date && /^\d{4}-\d{2}-\d{2}T/.test(r.date) ? r.date : null);
      params.push(
        r.id, r.title || 'Untitled report', when,
        r.orderFacility || null, r.performFacility || null,
        r.abnormal ? 1 : 0, Number(r.abnormalCount || 0), r.remarks || null
      );
    }
    await db.query(
      `INSERT INTO lab_reports
         (ext_id, title, reported_at, order_facility, perform_facility, abnormal, abnormal_count, remarks, created_at)
       VALUES ${rowsSql}
       ON DUPLICATE KEY UPDATE
         title = VALUES(title), reported_at = VALUES(reported_at),
         order_facility = VALUES(order_facility), perform_facility = VALUES(perform_facility),
         abnormal = VALUES(abnormal), abnormal_count = VALUES(abnormal_count),
         remarks = VALUES(remarks), created_at = UTC_TIMESTAMP()`,
      params
    );
  }

  // 2. map the export ids to numeric report ids
  const extIds = reports.map((r) => r.id);
  const idMap = new Map();
  for (let i = 0; i < extIds.length; i += chunkSize) {
    const [found] = await db.query('SELECT id, ext_id FROM lab_reports WHERE ext_id IN (?)', [
      extIds.slice(i, i + chunkSize)
    ]);
    for (const f of found) idMap.set(f.ext_id, f.id);
  }

  // 3. replace test rows: chunked DELETE, then chunked INSERTs
  const allIds = [...idMap.values()];
  const idsChunk = chunkSize * 2;
  for (let i = 0; i < allIds.length; i += idsChunk) {
    await db.query('DELETE FROM lab_result_rows WHERE report_id IN (?)', [allIds.slice(i, i + idsChunk)]);
  }
  const rowTuples = [];
  for (const r of reports) {
    const reportId = idMap.get(r.id);
    if (!reportId) continue;
    for (const row of r.rows || []) {
      rowTuples.push([
        reportId,
        row.seq ? parseInt(row.seq, 10) : null,
        row.test || '', row.result || null, row.ref || null,
        row.comments || null, row.abnormal ? 1 : 0
      ]);
    }
  }
  let rowsAdded = 0;
  for (let i = 0; i < rowTuples.length; i += chunkSize) {
    const chunk = rowTuples.slice(i, i + chunkSize);
    await db.query(
      `INSERT INTO lab_result_rows (report_id, seq, test, result, ref, comments, abnormal, created_at)
       VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())').join(', ')}`,
      chunk.flat(2)
    );
    rowsAdded += chunk.length;
  }

  return `${file}: ${reports.length} lab report(s) processed, ${rowsAdded} test row(s) stored`;
}

async function ingestDischarge(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const recs = j.records || [];
  let added = 0, updated = 0;

  const dx = (arr) => ((arr || []).map((x) => x.Name).filter(Boolean).join('; ') || null);

  for (const r of recs) {
    const d = r.details || {};
    const info = d.PatientInfo || {};
    const values = [
      r.id,
      r.venue || null,
      normWhen(r.listDate),
      normWhen(d.AdmissionDateTime),
      normWhen(d.DischargeDate),
      d.DischargeLocation || null,
      d.ServiceSpecialty || null,
      d.PrincipalDoctorName || null,
      d.PrincipalDoctorMCR || null,
      d.Account || null,
      info.Mrn || null,
      info.Name || null,
      dx(d.Diagnosis && d.Diagnosis.Primary),
      dx(d.Diagnosis && (d.Diagnosis.Secondary || [])),
      (d.DrugAllergy || []).length ? JSON.stringify(d.DrugAllergy) : null,
      (d.MedicalAlert || []).length ? JSON.stringify(d.MedicalAlert) : null,
      (d.Procedures || []).length ? JSON.stringify(d.Procedures) : null,
      d.PrescriptionText || null,
      JSON.stringify(d)
    ];
    const [res] = await db.query(
      `INSERT INTO discharge_records
         (ext_id, venue, list_date, admitted_at, discharged_at, location, specialty,
          doctor_name, doctor_mcr, account, mrn, patient_name,
          primary_dx, secondary_dx, allergy, alert, procedures, rx_text, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         venue = VALUES(venue), list_date = VALUES(list_date),
         admitted_at = VALUES(admitted_at), discharged_at = VALUES(discharged_at),
         location = VALUES(location), specialty = VALUES(specialty),
         doctor_name = VALUES(doctor_name), doctor_mcr = VALUES(doctor_mcr),
         account = VALUES(account), mrn = VALUES(mrn), patient_name = VALUES(patient_name),
         primary_dx = VALUES(primary_dx), secondary_dx = VALUES(secondary_dx),
         allergy = VALUES(allergy), alert = VALUES(alert),
         procedures = VALUES(procedures), rx_text = VALUES(rx_text),
         details = VALUES(details), created_at = UTC_TIMESTAMP()`,
      values
    );
    if (res.affectedRows === 1) added++;
    else updated++;
  }

  return `${file}: ${recs.length} discharge record(s) in file -> ${added} inserted, ${updated} updated`;
}

async function main() {
  await bootstrap(); // ensure the medical-record tables exist before importing
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.log('Usage: node src/ingest-healthhub.js <healthhub-export.json> [more.json ...]');
    process.exit(1);
  }
  const out = [];
  for (const file of files) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(j.reports)) out.push(await ingestLabs(file));
    else if (Array.isArray(j.records)) out.push(await ingestDischarge(file));
    else out.push(`${file}: unrecognised export shape, skipped`);
  }
  for (const line of out) console.log(line);
  process.exit(0);
}

main().catch((e) => {
  console.error('Ingest failed:', e.message);
  process.exit(1);
});