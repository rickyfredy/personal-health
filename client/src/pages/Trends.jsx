import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  CartDetail,
  CartRows,
  Chart,
  StatBand,
  collectUnits,
  fmtNum,
  monthLabel,
  shortDay
} from '../components/DashCards';

// Trends: everything aggregated — stat band, day/week/month charts,
// cart summaries and the per-item filter. The focused daily view lives
// on the Dashboard page.

export default function Trends() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [names, setNames] = useState([]);
  const [q, setQ] = useState(null); // null until the default from .env is decided

  useEffect(() => {
    document.title = 'Callista · trends';
  }, []);

  // Item names for the filter dropdown + the default from .env
  useEffect(() => {
    api
      .consumptionMeta()
      .then((m) => {
        setNames(m.names || []);
        setQ((prev) => (prev === null ? m.defaultItem || '' : prev));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (q === null) return;
    let live = true;
    setData(null);
    setError('');
    api
      .summary(q ? { q } : undefined)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [reload, q]);

  const matchedAny =
    !!data && ['daily', 'weekly', 'monthly'].some((sec) => data[sec].some((b) => (b.count || 0) > 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trends</h1>
          <p className="lede">
            Consumption over time — by day, week, month and per cart (items within{' '}
            {data?.cartWindowMinutes ?? '…'} minutes of each other group as one cart).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={q === null ? '' : q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter trends by item"
          >
            <option value="">All items</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button className="btn ghost" onClick={() => setReload((r) => r + 1)}>
            Refresh
          </button>
        </div>
      </div>

      {q && !error && (
        <div className="flash ok">
          Showing consumption of “{q}”.{' '}
          <button
            className="linklike"
            style={{ color: 'inherit', margin: 0 }}
            onClick={() => setQ('')}
          >
            Clear filter
          </button>
        </div>
      )}
      {q && data && !matchedAny && (
        <div className="flash err">No records of “{q}” in the dashboard period — every chart below shows zeros.</div>
      )}
      {error && <div className="flash err">{error}</div>}
      {!data && !error && q !== null && <p className="lede" style={{ marginTop: 24 }}>Loading summary…</p>}

      {data && <TrendsBody data={data} />}
    </>
  );
}

function TrendsBody({ data }) {
  const units = collectUnits(data);

  const daily = data.daily.map((b) => ({ name: shortDay(b.date), ...b.byUnit }));
  const weekly = data.weekly.map((b) => ({ name: b.key.replace(/^(\d{4})-/, '').slice(0, 6), ...b.byUnit }));
  const monthly = data.monthly.map((b) => ({ name: monthLabel(b.key), ...b.byUnit }));

  return (
    <>
      <StatBand data={data} />

      <div className="dash-grid">
        <div className="chart-card">
          <h2>Daily consumption</h2>
          <div className="sub">Last 30 days · bars stacked per unit</div>
          <Chart data={daily} units={units} />
        </div>
        <div className="chart-card">
          <h2>Weekly totals</h2>
          <div className="sub">Last 8 weeks (ISO, Monday start)</div>
          <Chart data={weekly} units={units} />
        </div>
        <div className="chart-card">
          <h2>Monthly totals</h2>
          <div className="sub">Last 6 months</div>
          <Chart data={monthly} units={units} />
        </div>

        <div className="chart-card">
          <h2>Carts by week</h2>
          <div className="sub">Groupings of items taken together</div>
          <CartRows buckets={data.cartWeekly} isWeek />
        </div>
        <div className="chart-card wide">
          <h2>Carts by month</h2>
          <div className="sub">Groupings of items taken together</div>
          <CartRows buckets={data.cartMonthly} />
        </div>
        <div className="chart-card wide">
          <h2>Recent carts</h2>
          <div className="sub">The {data.recentCarts.length} most recent groupings</div>
          <CartDetail carts={data.recentCarts} />
        </div>
      </div>
    </>
  );
}