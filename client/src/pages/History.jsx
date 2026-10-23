import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

const EMPTY_FORM = { name: '', amount: '', measurement: 'ml', consumption_time: '' };

export default function History() {
  const [meta, setMeta] = useState({ units: [] });
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({
    range: '7d',
    from: '',
    to: '',
    q: '',
    unit: '',
    page: 1,
    pageSize: 10
  });
  const [searchText, setSearchText] = useState('');
  const [flash, setFlash] = useState(null); // {kind:'ok'|'err', text}
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // record or 'new' | null
  const flashTimer = useRef(null);

  function say(kind, text) {
    setFlash({ kind, text });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3500);
  }

  // Debounced search box -> filters.q
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: searchText, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    document.title = 'Callista · consumption';
  }, []);

  useEffect(() => {
    api.consumptionMeta().then(setMeta).catch(() => {});
  }, []);

  function load(filters) {
    const params = { page: filters.page, pageSize: filters.pageSize, range: filters.range };
    if (filters.range === 'custom') {
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
    }
    if (filters.q) params.q = filters.q;
    if (filters.unit) params.unit = filters.unit;
    api
      .listConsumptions(params)
      .then((d) => setData(d))
      .catch((err) => say('err', err.message));
  }

  useEffect(() => {
    // refetch whenever the filter set changes (load(filters) reads
    // the current values; deliberately not memo-wrapped)
    load(filters);
  }, [filters]);

  async function moveTo(id, direction) {
    setBusyId(id);
    try {
      await api.moveConsumption(id, direction);
      await load(filters);
      say('ok', `Record moved ${direction === 'up' ? 'up (newer)' : 'down (older)'}.`);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rec) {
    if (!window.confirm(`Delete "${rec.name}" on ${rec.consumption_time.slice(0, 16)}?`)) return;
    setBusyId(rec.id);
    try {
      await api.deleteConsumption(rec.id);
      say('ok', `"${rec.name}" deleted.`);
      load(filters);
    } catch (err) {
      say('err', err.message);
    } finally {
      setBusyId(null);
    }
  }

  const rows = data?.rows || [];
  const pageWindow = useMemo(() => pageNumbers(data), [data]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Consumption</h1>
          <p className="lede">Everything consumed, newest first.</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + New record
        </button>
      </div>

      <div className="toolbar" role="search">
        <select
          className="select"
          value={filters.range}
          onChange={(e) =>
            setFilters((f) => ({ ...f, range: e.target.value, page: 1 }))
          }
          aria-label="Date range"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
          <option value="custom">Custom range…</option>
        </select>
        {filters.range === 'custom' && (
          <>
            <input
              type="date"
              className="input"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
              aria-label="From date"
            />
            <input
              type="date"
              className="input"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
              aria-label="To date"
            />
          </>
        )}
        <input
          className="input search"
          placeholder="Search item name…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search by name"
        />
        <select
          className="select"
          value={filters.unit}
          onChange={(e) => setFilters((f) => ({ ...f, unit: e.target.value, page: 1 }))}
          aria-label="Filter by unit"
        >
          <option value="">All units</option>
          {meta.units.map((u) => (
            <option key={u.unit} value={u.unit}>
              {u.unit}
            </option>
          ))}
        </select>
      </div>

      {flash && <div className={`flash ${flash.kind}`}>{flash.text}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Item</th>
              <th>Amount</th>
              <th>Unit</th>
              <th className="cell-muted">Logged</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={busyId === r.id ? { opacity: 0.5 } : undefined}>
                <td className="cell-time">
                  <div className="d">{fmtDate(r.consumption_time)}</div>
                  <div className="t">{r.consumption_time.slice(11, 16)}</div>
                </td>
                <td className="cell-name">{r.name}</td>
                <td className="cell-amount">{fmtNum(r.amount)}</td>
                <td>
                  <span className="unit-badge">{r.measurement}</span>
                </td>
                <td className="cell-muted">{fmtDate(r.created_at)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="iconbtn"
                      title="Move up (newer)"
                      onClick={() => moveTo(r.id, 'up')}
                      disabled={busyId !== null}
                    >
                      ↑
                    </button>
                    <button
                      className="iconbtn"
                      title="Move down (older)"
                      onClick={() => moveTo(r.id, 'down')}
                      disabled={busyId !== null}
                    >
                      ↓
                    </button>
                    <button
                      className="iconbtn"
                      title="Edit"
                      onClick={() => setEditing(r)}
                      disabled={busyId !== null}
                    >
                      ✎
                    </button>
                    <button
                      className="iconbtn delete"
                      title="Delete"
                      onClick={() => remove(r)}
                      disabled={busyId !== null}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="big">No records in this view</div>
                    <div>
                      Widen the date range or clear the search, or add a new record with “+ New record”.
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="pagination">
          <span className="info">
            {data ? `${fmtNum(data.total)} record${data.total === 1 ? '' : 's'} found` : ' '}
          </span>
          <span className="pagebtns">
            <button
              className="pagebtn"
              disabled={!data || data.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              ‹ Prev
            </button>
            {pageWindow.map((p) => (
              <button
                key={p}
                className={`pagebtn ${data?.page === p ? 'current' : ''}`}
                onClick={() => setFilters((f) => ({ ...f, page: p }))}
              >
                {p}
              </button>
            ))}
            <button
              className="pagebtn"
              disabled={!data || data.page >= data.pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next ›
            </button>
            <select
              className="select"
              style={{ height: 30, padding: '2px 8px', marginLeft: 8 }}
              value={filters.pageSize}
              onChange={(e) => setFilters((f) => ({ ...f, pageSize: Number(e.target.value), page: 1 }))}
              aria-label="Rows per page"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </span>
        </div>
      </div>

      {(editing !== null) && (
        <RecordForm
          record={editing}
          units={[...new Set([...meta.units.map((u) => u.unit), 'ml'])]}
          onClose={() => setEditing(null)}
          onSaved={(done, isNew) => {
            setEditing(null);
            say('ok', isNew ? 'Record added.' : 'Record updated.');
            load(filters);
          }}
        />
      )}
    </>
  );
}

function pageNumbers(data) {
  if (!data) return [];
  const { page, pages } = data;
  const span = Math.min(5, pages);
  let start = Math.max(1, Math.min(page - 2, pages - span + 1));
  return Array.from({ length: span }, (_, i) => start + i);
}

/* Record create/edit modal */
function RecordForm({ record, units, onClose, onSaved }) {
  const isNew = record === 'new';
  const [form, setForm] = useState(
    isNew
      ? { ...EMPTY_FORM, consumption_time: toLocalInput(new Date()) }
      : {
          name: record.name,
          amount: String(record.amount),
          measurement: record.measurement,
          consumption_time: record.consumption_time.slice(0, 16).replace(' ', 'T')
        }
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (isNew) await api.createConsumption(payload);
      else await api.updateConsumption(record.id, payload);
      onSaved(null, isNew);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      else setErrors({ _global: err.message });
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true">
        <h2>{isNew ? 'New record' : 'Edit record'}</h2>
        {errors._global && <div className="form-error" role="alert">{errors._global}</div>}
        <div className="form">
          <div className="field">
            <label htmlFor="f-name">Item name</label>
            <input
              id="f-name"
              className="input"
              autoFocus
              maxLength={50}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <span>Amount &amp; unit</span>
            <div className="row2">
              <input
                className="input"
                type="number"
                step="0.1"
                min="0.1"
                value={form.amount}
                onChange={(e) => setField('amount', e.target.value)}
                aria-label="Amount"
              />
              <input
                className="input"
                maxLength={10}
                list="unit-list"
                value={form.measurement}
                onChange={(e) => setField('measurement', e.target.value)}
                aria-label="Unit"
              />
              <datalist id="unit-list">
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            {(errors.amount || errors.measurement) && (
              <span className="field-error">{errors.amount || errors.measurement}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="f-time">Consumed at</label>
            <input
              id="f-time"
              className="input"
              type="datetime-local"
              value={form.consumption_time}
              onChange={(e) => setField('consumption_time', e.target.value)}
            />
            {errors.consumption_time && (
              <span className="field-error">{errors.consumption_time}</span>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : isNew ? 'Add record' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ---------- formatting ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split(' ')[0].split('-').map(Number);
  const wd = DAYS[new Date(`${y}-${m}-${d}T00:00:00Z`).getUTCDay()];
  return `${wd}, ${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtNum(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}