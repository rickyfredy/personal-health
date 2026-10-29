import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { shortDay } from '../components/DashCards';

const strip = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export default function Labs() {
  const [meta, setMeta] = useState({ total: 0, abnormalTotal: 0 });
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [abnOnly, setAbnOnly] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [rows, setRows] = useState({}); // numeric report id -> test rows
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    document.title = 'Callista · lab results';
  }, []);

  useEffect(() => {
    let live = true;
    setError('');
    api
      .labs({ limit: 1000 })
      .then((d) => {
        if (!live) return;
        setAll(d.reports);
        setMeta({ total: d.total, abnormalTotal: d.abnormalTotal });
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const list = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!abnOnly || r.abnormal) &&
        (!needle ||
          `${r.title} ${r.order_facility || ''} ${r.perform_facility || ''}`
            .toLowerCase()
            .includes(needle))
    );
  }, [all, q, abnOnly]);

  async function toggle(id) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    if (!rows[id]) {
      setLoadingRows(true);
      try {
        const d = await api.labRows(id);
        setRows((c) => ({ ...c, [id]: d.rows }));
      } catch {
        /* the expanded panel will show what loaded */
      } finally {
        setLoadingRows(false);
      }
    }
  }

  const keyToggle = (id) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lab results</h1>
          <p className="lede">
            {all
              ? `${meta.total} report${meta.total === 1 ? '' : 's'}, ${meta.abnormalTotal} flagged — open a report to see every test row.`
              : 'Loading…'}
          </p>
        </div>
        <input
          className="input search"
          placeholder="Search title or facility…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search lab reports"
        />
      </div>

      <div className="toolbar">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
          <input type="checkbox" checked={abnOnly} onChange={(e) => setAbnOnly(e.target.checked)} />
          Flagged only
        </label>
        <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{list.length} shown</span>
      </div>

      {error && <div className="flash err">{error}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th className="c" style={{ width: 44 }}>No.</th>
              <th style={{ width: 110 }}>Reported</th>
              <th>Title</th>
              <th>Facility</th>
              <th className="c" style={{ width: 90 }}>Flagged</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <Fragment key={r.id}>
                <tr
                  className="clickrow"
                  tabIndex={0}
                  onKeyDown={keyToggle(r.id)}
                  onClick={() => toggle(r.id)}
                  title="Open / close the test rows"
                >
                  <td className="c rowno">{i + 1}</td>
                  <td className="cell-amount">{shortDay(r.reported_at)}</td>
                  <td>
                    {openId === r.id ? '▾ ' : '▸ '}
                    {r.title}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                    {r.order_facility || r.perform_facility || '—'}
                  </td>
                  <td className="c">
                    {r.abnormal ? (
                      <span
                        className="unit-badge"
                        style={{ background: 'var(--amber-fill)', color: 'var(--amber)' }}
                      >
                        ⚑ {r.abnormal_count}
                      </span>
                    ) : (
                      <span className="rowno">—</span>
                    )}
                  </td>
                </tr>
                {openId === r.id && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0 14px 14px', background: 'var(--mint-soft)' }}>
                      <div className="expand-panel">
                        {loadingRows && !rows[r.id] && <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading test rows…</span>}
                        {rows[r.id] && (
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th style={{ width: 240 }}>Test</th>
                                  <th>Result</th>
                                  <th style={{ width: 140 }}>Reference</th>
                                  <th>Remarks</th>
                                  <th className="c" style={{ width: 50 }}>⚑</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows[r.id].map((row, k) => (
                                  <tr key={k} style={row.abnormal ? { background: 'var(--amber-fill)' } : undefined}>
                                    <td style={{ fontWeight: 600, whiteSpace: 'normal' }}>{strip(row.test)}</td>
                                    <td style={{ whiteSpace: 'normal' }}>{strip(row.result) || '—'}</td>
                                    <td className="rowno" style={{ whiteSpace: 'nowrap' }}>{strip(row.ref) || '—'}</td>
                                    <td style={{ color: 'var(--ink-faint)', fontSize: 12.5, whiteSpace: 'normal' }}>
                                      {strip(row.comments) || '—'}
                                    </td>
                                    <td className="c">{row.abnormal ? '⚑' : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <div className="big">No reports match</div>
                    <div>Clear the search or the “flagged only” filter.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}