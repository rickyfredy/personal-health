import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { SimplePager, shortDay, withinBucket } from '../components/DashCards';

const strip = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const PAGE_SIZE = 20;
const BUCKETS = [
  { v: '3', label: 'Last 3 months' },
  { v: '6', label: 'Last 6 months' },
  { v: '9', label: 'Last 9 months' },
  { v: '12', label: 'Last 1 year' },
  { v: '', label: 'All dates' }
];

export default function Labs() {
  const [meta, setMeta] = useState({ total: 0, abnormalTotal: 0 });
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [abnOnly, setAbnOnly] = useState(false);
  const [titleSel, setTitleSel] = useState('');
  const [bucket, setBucket] = useState('');
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    setPage(1); // any filter change re-centers the pager
  }, [q, abnOnly, titleSel, bucket]);

  const titles = useMemo(
    () => [...new Set((all || []).map((r) => r.title).filter(Boolean))].sort(),
    [all]
  );

  const filtered = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!abnOnly || r.abnormal) &&
        (!titleSel || r.title === titleSel) &&
        withinBucket(r.reported_at, bucket || null) &&
        (!needle ||
          `${r.title} ${r.order_facility || ''} ${r.perform_facility || ''}`
            .toLowerCase()
            .includes(needle))
    );
  }, [all, q, abnOnly, titleSel, bucket]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function toggle(id) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    if (!rows[id]) {
      setLoadingRows(true);
      try {
        const d = await api.labRows(id);
        setRows((c) => ({ ...c, [id]: d.rows }));
      } catch {
        /* the expanded panel shows what loaded */
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
              ? `${meta.total} report${meta.total === 1 ? '' : 's'}, ${meta.abnormalTotal} flagged — open one to see its test rows.`
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
        <select className="select" value={titleSel} onChange={(e) => setTitleSel(e.target.value)} aria-label="Report title">
          <option value="">All report titles</option>
          {titles.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Report period">
          {BUCKETS.map((b) => (
            <option key={b.v} value={b.v}>{b.label}</option>
          ))}
        </select>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
          <input type="checkbox" checked={abnOnly} onChange={(e) => setAbnOnly(e.target.checked)} />
          Flagged only
        </label>
        <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{filtered.length} shown</span>
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
            {slice.map((r, i) => (
              <Fragment key={r.id}>
                <tr
                  className="clickrow"
                  tabIndex={0}
                  onKeyDown={keyToggle(r.id)}
                  onClick={() => toggle(r.id)}
                  title="Open / close the test rows"
                >
                  <td className="c rowno">{(safePage - 1) * PAGE_SIZE + i + 1}</td>
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
                      <span className="unit-badge" style={{ background: 'var(--amber-fill)', color: 'var(--amber)' }}>
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
                        {loadingRows && !rows[r.id] && (
                          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading test rows…</span>
                        )}
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
            {slice.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <div className="big">No reports match</div>
                    <div>Clear the search, title or period filters.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ padding: '10px 14px' }}>
                <SimplePager
                  page={safePage}
                  pages={pages}
                  setPage={setPage}
                  disabled={filtered.length === 0}
                  info={`page ${safePage} of ${pages} · ${filtered.length} report${filtered.length === 1 ? '' : 's'} · 20 per page`}
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}