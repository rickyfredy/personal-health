import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';

const strip = (s) => String(s || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const when = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');

export default function Discharge() {
  const [records, setRecords] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // record id

  useEffect(() => {
    document.title = 'Callista · discharge summaries';
  }, []);

  useEffect(() => {
    let live = true;
    setError('');
    api
      .discharge({ limit: 100 })
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Discharge summaries</h1>
          <p className="lede">
            {records ? `${total} hospital episo${total === 1 ? 'de' : 'des'} — open one for diagnoses, procedures and medication.` : 'Loading…'}
          </p>
        </div>
      </div>

      {error && <div className="flash err">{error}</div>}
      {records && records.length === 0 && (
        <div className="empty">
          <div className="big">No discharge summaries yet</div>
          <div>They arrive with the next HealthHub export import.</div>
        </div>
      )}

      <div className="discharge-list">
        {records &&
          records.map((r) => {
            const dx = (r.primary_dx || '').split('; ').filter(Boolean);
            const isOpen = open === r.id;
            return (
              <div className="chart-card" key={r.id} style={{ padding: 18 }}>
                <div className="card-head" style={{ marginBottom: 4 }}>
                  <h2 style={{ fontSize: 19 }}>{when(r.discharged_at)}</h2>
                  <div className="chipline">
                    {r.venue && <span className="unit-badge">{r.venue}</span>}
                    {r.specialty && <span className="chip">{r.specialty}</span>}
                  </div>
                </div>
                <div className="sub" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                  {r.admitted_at && <span>admitted {when(r.admitted_at)}</span>}
                  {r.doctor_name && <span>· {r.doctor_name}{r.doctor_mcr ? ` (${r.doctor_mcr})` : ''}</span>}
                  {(r.procedures || []).length > 0 && <span>· {(r.procedures).length} procedure(s)</span>}
                </div>
                {dx.length > 0 && (
                  <div className="chipline" style={{ marginTop: 8 }}>
                    {dx.map((d, i) => (
                      <span className="chip" key={i} style={{ background: 'var(--mint)', borderStyle: 'solid' }}>
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                <button className="linklike" style={{ color: 'var(--spruce)', marginTop: 10 }} onClick={() => setOpen(isOpen ? null : r.id)}>
                  {isOpen ? 'Close details' : 'Open details'}
                </button>
                {isOpen && (
                  <div className="expand-panel">
                    <div className="kv">
                      {r.mrn && <><span className="k">MRN</span><span>{r.mrn}</span></>}
                      {r.account && <><span className="k">Account</span><span>{r.account}</span></>}
                      {r.location && <><span className="k">Location</span><span>{r.location}</span></>}
                      <span className="k">Discharge at</span>
                      <span>{when(r.discharged_at)}</span>
                      {r.admitted_at && <><span className="k">Admitted at</span><span>{when(r.admitted_at)}</span></>}
                      {(r.secondary_dx || '').split('; ').filter(Boolean).length > 0 && (
                        <>
                          <span className="k">Secondary dx</span>
                          <span>{r.secondary_dx}</span>
                        </>
                      )}
                    </div>
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
    </>
  );
}