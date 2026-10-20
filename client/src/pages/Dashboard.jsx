import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../api';

const UNIT_COLORS = ['#1F6F5C', '#D9962E', '#AB4660', '#4E7C94', '#7A5EA6'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const [data, setData] = useState(null); // charts + stats + carts
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [names, setNames] = useState([]);
  const [q, setQ] = useState(null); // null until the default from .env is decided
  const [weekOffset, setWeekOffset] = useState(0); // this-week table paging
  const [dayOffset, setDayOffset] = useState(0); // daily-summary day paging
  const [matrix, setMatrix] = useState(null); // weekly table (own fetch)
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [feeds, setFeeds] = useState(null); // daily summary (own fetch)
  const [feedsLoading, setFeedsLoading] = useState(true);

  useEffect(() => {
    document.title = 'Callista · dashboard';
  }, []);

  // Item names for the filter dropdown + the default item from .env
  useEffect(() => {
    api
      .consumptionMeta()
      .then((m) => {
        setNames(m.names || []);
        setQ((prev) => (prev === null ? m.defaultItem || '' : prev));
      })
      .catch(() => {});
  }, []);

  // switching items re-centers both tables
  useEffect(() => {
    setWeekOffset(0);
    setDayOffset(0);
  }, [q]);

  // base summary: charts, stats, cart summaries
  useEffect(() => {
    if (q === null) return; // wait for the default item to be resolved
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

  // weekly table ONLY
  useEffect(() => {
    if (q === null) return;
    let live = true;
    setMatrixLoading(true);
    const params = {};
    if (q) params.q = q;
    if (weekOffset) params.week = weekOffset;
    api
      .summaryMatrix(Object.keys(params).length ? params : undefined)
      .then((d) => {
        if (!live) return;
        setMatrix(d);
        setMatrixLoading(false);
      })
      .catch(() => live && setMatrixLoading(false));
    return () => {
      live = false;
    };
  }, [reload, q, weekOffset]);

  // daily summary ONLY
  useEffect(() => {
    if (q === null) return;
    let live = true;
    setFeedsLoading(true);
    const params = {};
    if (q) params.q = q;
    if (dayOffset) params.day = dayOffset;
    api
      .summaryFeeds(Object.keys(params).length ? params : undefined)
      .then((d) => {
        if (!live) return;
        setFeeds(d);
        setFeedsLoading(false);
      })
      .catch(() => live && setFeedsLoading(false));
    return () => {
      live = false;
    };
  }, [reload, q, dayOffset]);

  const matchedAny =
    !!data && ['daily', 'weekly', 'monthly'].some((sec) => data[sec].some((b) => (b.count || 0) > 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">
            Summary by day, week and month — and history of each feeding cart (items
            within {data?.cartWindowMinutes ?? '…'} minutes of each other).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={q === null ? '' : q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Filter dashboard by item"
          >
            <option value="">All items</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setMatrixLoading(true);
              setFeedsLoading(true);
              setReload((r) => r + 1);
            }}
          >
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
      {data && (
        <DashboardBody
          data={data}
          matrix={matrix}
          matrixLoading={matrixLoading}
          feeds={feeds}
          feedsLoading={feedsLoading}
          weekOffset={weekOffset}
          dayOffset={dayOffset}
          onWeek={setWeekOffset}
          onDay={setDayOffset}
        />
      )}
    </>
  );
}

function DashboardBody({ data, matrix, matrixLoading, feeds, feedsLoading, weekOffset, dayOffset, onWeek, onDay }) {
  const units = collectUnits(data);
  const unitSums = (byUnit) =>
    Object.entries(byUnit)
      .map(([u, v]) => `${fmtNum(v)} ${u}`)
      .join('  ·  ') || '—';
  const filterName = data.filter || null;

  const daily = data.daily.map((b) => ({ name: shortDay(b.date), ...b.byUnit }));
  const weekly = data.weekly.map((b) => ({ name: b.key.replace(/^(\d{4})-/, '').slice(0, 6), ...b.byUnit }));
  const monthly = data.monthly.map((b) => ({ name: monthLabel(b.key), ...b.byUnit }));

  const w = data.cartWeekly[data.cartWeekly.length - 1] || { carts: 0, items: 0 };

  return (
    <>
      <div className="statband">
        <div className="stat">
          <div className="label">Today</div>
          <div className="value">{data.stats.todayCount}</div>
          <div className="sub">{unitSums(data.stats.todayByUnit)}</div>
        </div>
        <div className="stat">
          <div className="label">Last 7 days</div>
          <div className="value">{data.stats.week7.count}</div>
          <div className="sub">{unitSums(data.stats.week7.byUnit)}</div>
        </div>
        <div className="stat">
          <div className="label">Last 30 days</div>
          <div className="value">{data.stats.month30.count}</div>
          <div className="sub">{unitSums(data.stats.month30.byUnit)}</div>
        </div>
        <div className="stat">
          <div className="label">Carts this week</div>
          <div className="value">{w.carts}</div>
          <div className="sub">
            {w.items} items{w.carts ? ` · ${(w.items / w.carts).toFixed(1)} per cart` : ''}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {/* weekly table — paging refetches only this card */}
        <div className="chart-card wide">
          <div className="card-head">
            <h2>
              {weekOffset === 0
                ? 'This week'
                : matrix
                  ? `Week of ${shortDay(matrix.dates[0])}`
                  : 'This week'}
            </h2>
            <div className="pagebtns">
              <button
                className="pagebtn"
                onClick={() => onWeek(weekOffset - 1)}
                title="Previous week"
              >
                ‹ Prev
              </button>
              <button
                className="pagebtn"
                disabled={weekOffset >= 1}
                onClick={() => onWeek(weekOffset + 1)}
                title="Next week"
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="sub">
            {matrix ? (
              <>
                Sunday to Saturday, {shortDay(matrix.dates[0])} – {shortDay(matrix.dates[6])}
                {filterName ? ` · filtered to “${filterName}”` : ' · all items'}
                {weekOffset !== 0 &&
                  ` · ${weekOffset < 0 ? `${Math.abs(weekOffset)} week${weekOffset === -1 ? '' : 's'} back` : 'ahead'}`}
              </>
            ) : (
              'Loading…'
            )}
          </div>
          <div className="fade-wrap" style={{ opacity: matrixLoading ? 0.45 : 1 }}>
            {matrix && <WeekMatrix matrix={matrix} />}
          </div>
        </div>

        {/* daily summary — paging refetches only this card */}
        <div className="chart-card">
          <div className="card-head">
            <h2>{filterName ? `${filterName} · daily` : 'Daily feeds'}</h2>
            <div className="pagebtns">
              <button
                className="pagebtn"
                disabled={feedsLoading || (feeds && feeds.date === null)}
                onClick={() => onDay(dayOffset + 1)}
                title="Earlier day with records"
              >
                ‹ Prev
              </button>
              <button
                className="pagebtn"
                disabled={feedsLoading || dayOffset <= 0}
                onClick={() => onDay(Math.max(0, dayOffset - 1))}
                title="Later day with records"
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="sub">
            {feeds ? (
              `${dayOffset === 0 ? 'Most recent day with records' : `${dayOffset} record-day${dayOffset === 1 ? '' : 's'} back`} · ${shortDay(feeds.date ?? '')} · sessions within ${feeds.cartWindowMinutes} min`
            ) : (
              'Loading…'
            )}
          </div>
          <div className="fade-wrap" style={{ opacity: feedsLoading ? 0.45 : 1 }}>
            {feeds && <DailyFeeds feeds={feeds} filterName={filterName} />}
          </div>
        </div>

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

/* ---------- tables ---------- */

// Items as rows, Sun..Sat as columns, cells like "100 ml" or "-".
function WeekMatrix({ matrix }) {
  if (!matrix.rows.length) {
    return (
      <div className="empty">
        <div className="big">Nothing recorded this week</div>
        <div>
          Between {shortDay(matrix.dates[0])} and {shortDay(matrix.dates[6])}. Add records or adjust the
          item filter.
        </div>
      </div>
    );
  }
  return (
    <div className="table-wrap" style={{ padding: '6px 0 12px' }}>
      <table className="matrix">
        <thead>
          <tr>
            <th>Item</th>
            {DAYS7.map((d, i) => (
              <th key={d} className="day">
                {d}
                <small>{dayNum(matrix.dates[i])}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.name}>
              <td className="cell-name">{row.name}</td>
              {matrix.dates.map((date) => {
                const cell = row.cells[date];
                const text = cell
                  ? Object.entries(cell)
                      .map(([u, v]) => `${fmtNum(v)} ${u}`)
                      .join(' + ')
                  : '-';
                return (
                  <td key={date} className={`c cell-amount ${text === '-' ? 'dash' : ''}`}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Feed sessions of one day, volumes in units.
function DailyFeeds({ feeds, filterName }) {
  if (feeds.date === null) {
    return (
      <div className="empty">
        <div className="big">Reached the start of the history</div>
        <div>
          There are no more{filterName ? ` “${filterName}”` : ''} records before this — press Next › to
          come back.
        </div>
      </div>
    );
  }
  if (!feeds.rows.length) {
    return (
      <div className="empty">
        <div className="big">No sessions that day</div>
        <div>{shortDay(feeds.date)} has no{filterName ? ` “${filterName}”` : ''} records.</div>
      </div>
    );
  }
  return (
    <div className="table-wrap" style={{ padding: '6px 0 12px' }}>
      <table className="matrix">
        <thead>
          <tr>
            <th>Feed time</th>
            <th className="c">Volume</th>
          </tr>
        </thead>
        <tbody>
          {feeds.rows.map((r) => (
            <tr key={r.time}>
              <td className="cell-amount">{r.time}</td>
              <td className="c cell-amount">
                {unitText(r.byUnit) === '—' ? '-' : unitText(r.byUnit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- charts ---------- */

function Chart({ data, units }) {
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#e4eee9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7d938b' }} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: '#7d938b' }} />
          <Tooltip
            cursor={{ fill: 'rgba(31,111,92,0.06)' }}
            formatter={(v, u) => [`${fmtNum(v)} ${u}`, u]}
            labelStyle={{ fontWeight: 600 }}
          />
          {units.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {units.map((u, i) => (
            <Bar key={u} dataKey={u} stackId="a" fill={UNIT_COLORS[i % UNIT_COLORS.length]} maxBarSize={26} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CartRows({ buckets, isWeek }) {
  const maxItems = Math.max(1, ...buckets.map((b) => b.items));
  return (
    <div className="cart-rows">
      {buckets.map((b) => (
        <div className="cart-row" key={b.key}>
          <span className="when">{isWeek ? `W${b.key.slice(6)}` : monthLabel(b.key)}</span>
          <span className="counts">
            {b.carts} cart{b.carts === 1 ? '' : 's'} · {b.items} item{b.items === 1 ? '' : 's'}
          </span>
          <span className="bar">
            <i style={{ width: `${(b.items / maxItems) * 100}%` }} />
          </span>
          <span className="units">{unitText(b.byUnit)}</span>
        </div>
      ))}
    </div>
  );
}

function CartDetail({ carts }) {
  return (
    <div className="cart-rows">
      {carts.map((c) => (
        <div className="cart-row" key={c.start}>
          <span className="when">{whenLabel(c.start)}</span>
          <span className="counts">{c.items.length} item{c.items.length === 1 ? '' : 's'}</span>
          <ul className="cart-items">
            {c.items.map((it) => (
              <li className="chip" key={it.id}>
                {it.name} {fmtNum(it.amount)} {it.unit}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ---------- formatting ---------- */

function collectUnits(data) {
  const set = new Set();
  for (const sec of ['daily', 'weekly', 'monthly']) {
    for (const b of data[sec]) for (const u of Object.keys(b.byUnit || {})) set.add(u);
  }
  return [...set].sort();
}

function unitText(byUnit) {
  return (
    Object.entries(byUnit)
      .map(([u, v]) => `${fmtNum(v)} ${u}`)
      .join(' · ') || '—'
  );
}

function shortDay(date) {
  if (!date) return '';
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function dayNum(date) {
  return Number(date.split('-')[2]);
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function whenLabel(s) {
  // "2026-10-14 09:05" -> "14 Oct · 09:05"
  const [date, time] = s.split(' ');
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} · ${time}`;
}

function fmtNum(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}