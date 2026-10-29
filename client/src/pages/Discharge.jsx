import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { SimplePager, fmtDMY, fmtShortDate, withinBucket } from '../components/DashCards';

const strip = (s) => String(s || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const PAGE_SIZE = 20;
const BUCKETS = [
  { v: '3', label: 'Last 3 months' },
  { v: '6', label: 'Last 6 months' },
  { v: '9', label: 'Last 9 months' },
  { v: '12', label: 'Last 1 year' },
  { v: '', label: 'All' }
];

export default function Discharge() {
  const [records, setRecords] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // record id

  // filters + paging
  const [specialty, setSpecialty] = useState('');
  const [bucket, setBucket] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.title = 'Callista · discharge summaries';
  }, []);

  useEffect(() => {
    let live = true;
    setError('');
    api
      .discharge({ limit: 500 })
      .then((d) => {
        if (!live) return;
        setRecords(d.records);
        setTotal(d.total);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setPage(1); // any filter change re-centers the pager
  }, [specialty, bucket]);

  const specialties = useMemo(
    () => [...new Set((records || []).map((r) => r.specialty).filter(Boolean))].sort(),
    [records]
  );

  const filtered = useMemo(() => {
    if (!records) return [];
    return records.filter(
      (r) => (!specialty || r.specialty === specialty) && withinBucket(r.admitted_at, bucket || null)
    );
  }, [records, specialty, bucket]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Discharge summaries</h1>
          <p className="lede">
            {records
              ? `${total} hospital episod${total === 1 ? 'e' : 'es'} — ${filtered.length} match the current filters.`
              : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Admission period">
          {BUCKETS.map((b) => (
            <option key={b.v} value={b.v}>{b.label} (admission)</option>
          ))}
        </select>
        <select className="select" value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Specialty">
          <option value="">All specialties</option>
          {specialties.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <div className="flash err">{error}</div>}
      {records && filtered.length === 0 && (
        <div className="empty">
          <div className="big">No discharge summaries match</div>
          <div>Widen the admission period or clear the specialty filter.</div>
        </div>
      )}

      <div className="discharge-list">
        {slice.map((r) => {
          const dx = (r.primary_dx || '').split('; ').filter(Boolean);
          const isOpen = open === r.id;
          return (
            <div className="chart-card" key={r.id} style={{ padding: 18 }}>
              <div className="card-head" style={{ marginBottom: 4 }}>
                <h2 style={{ fontSize: 19 }}>{fmtShortDate(r.discharged_at)}</h2>
                <div className="chipline">
                  {r.venue && <span className="unit-badge">{r.venue}</span>}
                  {r.specialty && <span className="chip">{r.specialty}</span>}
                </div>
              </div>
              <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                {r.admitted_at && <span>admitted {fmtDMY(r.admitted_at)}</span>}
                {r.doctor_name && <span>· {r.doctor_name}{r.doctor_mcr ? ` (${r.doctor_mcr})` : ''}</span>}
                {(r.procedures || []).length > 0 && <span>· {r.procedures.length} procedure(s)</span>}
              </div>
              {dx.length > 0 && (
                <div className="chipline" style={{ marginTop: 8 }}>
                  {dx.map((d, i) => (
                    <span className="chip" key={i} style={{ background: 'var(--mint)' }}>
                      {d}
                    </span>
                  ))}
                </div>
              )}
              <button
                className="linklike"
                style={{ color: 'var(--spruce)', marginTop: 10 }}
                onClick={() => setOpen(isOpen ? null : r.id)}
              >
                {isOpen ? 'Close details' : 'Open details'}
              </button>
              {isOpen && (
                <div className="expand-panel">
                  <div className="kv">
                    <span className="k">Discharge date</span>
                    <span>{fmtDMY(r.discharged_at)}</span>
                    {r.admitted_at && (
                      <>
                        <span className="k">Admission date</span>
                        <span>{fmtDMY(r.admitted_at)}</span>
                      </>
                    )}
                    {r.mrn && <><span className="k">MRN</span><span>{r.mrn}</span></>}
                    {r.account && <><span className="k">Account</span><span>{r.account}</span></>}
                    {r.location && <><span className="k">Location</span><span>{r.location}</span></>}
                  </div>
                  {(r.secondary_dx || '').split('; ').filter(Boolean).length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Secondary diagnoses</h3>
                      <div className="chipline">
                        {r.secondary_dx.split('; ').map((d, i) => (
                          <span className="chip" key={i}>{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(r.procedures || []).length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Procedures</h3>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {r.procedures.map((p, i) => (
                          <li key={i} style={{ fontSize: 13.5, marginBottom: 3 }}>
                            {p.Description || p.OperationType}
                            {p.FormatOperationDateTime ? ` — ${p.FormatOperationDateTime}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(r.allergy || []).length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Drug allergy</h3>
                      <div className="chipline">
                        {r.allergy.map((a, i) => (
                          <span className="chip" key={i} style={{ background: 'var(--berry-fill)', color: 'var(--berry)' }}>
                            {a.AllergySource || a.Allergy || a.Substance || JSON.stringify(a).slice(0, 60)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(r.alert || []).length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Medical alert</h3>
                      <div className="chipline">
                        {r.alert.map((a, i) => (
                          <span className="chip" key={i} style={{ background: 'var(--amber-fill)', color: 'var(--amber)' }}>
                            {a.AlertType || a.Description || JSON.stringify(a).slice(0, 60)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.rx_text && strip(r.rx_text) && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Medication at discharge</h3>
                      <div className="note-block">{strip(r.rx_text)}</div>
                    </div>
                  )}
                  {(r.clinical || []).filter(Boolean).length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Clinical summary</h3>
                      {r.clinical.map((c, i) => (
                        <Fragment key={i}>
                          {c.Type && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{c.Type}</div>}
                          {(c.Descriptions || []).map((desc, k) => (
                            <div className="note-block" key={k} style={{ marginBottom: 8 }}>{strip(desc)}</div>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {records && (
        <div className="card" style={{ marginTop: 14, padding: '10px 16px' }}>
          <SimplePager
            page={safePage}
            pages={pages}
            setPage={setPage}
            disabled={filtered.length === 0}
            info={`page ${safePage} of ${pages} · ${filtered.length} record${filtered.length === 1 ? '' : 's'} · 20 per page`}
          />
        </div>
      )}
    </>
  );
}