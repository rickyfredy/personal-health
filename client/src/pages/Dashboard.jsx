import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../api';
import {
  Chart,
  DailyFeedsCard,
  WeekMatrixCard,
  MONTHS,
  collectUnitsOfDays,
  fmtShortDate,
  fmtNum,
  shortDay,
  unitText
} from '../components/DashCards';

// Focused day-to-day view: this week's items, the daily milk summary
// (with the day's total volume) and the last 30 days of milk volumes.
// The "milk" item comes from .env (DEFAULT_DASHBOARD_ITEM); stats, charts
// over all items and the item filter live on the Trends page.

export default function Dashboard() {
  const [milkItem, setMilkItem] = useState(undefined); // undefined = resolving
  const [reload, setReload] = useState(0);

  // weekly table — always all items, own fetch
  const [matrix, setMatrix] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // daily milk summary — own fetch, follows the configured item
  const [feeds, setFeeds] = useState(null);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);

  // milk volumes for the 30-day chart — own fetch
  const [daily, setDaily] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(true);

  // every record of a chosen day (milk + medicine) — own fetch
  const [viewDate, setViewDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [dayRecords, setDayRecords] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(true);

  // NGT change history — rows of the ngt_history table (written by an
  // external channel), newest first, 5 per page
  const [ngtPage, setNgtPage] = useState(1);
  const [ngtData, setNgtData] = useState(null);
  const [ngtLoading, setNgtLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setNgtLoading(true);
    api
      .ngtChanges({ page: ngtPage })
      .then((d) => {
        if (!live) return;
        setNgtData(d);
        setNgtLoading(false);
      })
      .catch(() => live && setNgtLoading(false));
    return () => {
      live = false;
    };
  }, [reload, ngtPage]);

  // care-timeline: CRP values over time + admission/discharge markers
  const [timeline, setTimeline] = useState(null);
  const [tLoading, setTLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setTLoading(true);
    api
      .timeline()
      .then((d) => {
        if (!live) return;
        setTimeline(d);
        setTLoading(false);
      })
      .catch(() => live && setTLoading(false));
    return () => {
      live = false;
    };
  }, [reload]);

  useEffect(() => {
    let live = true;
    setRecordsLoading(true);
    api
      .listConsumptions({
        range: 'custom',
        from: viewDate,
        to: viewDate,
        pageSize: 100,
        sort: 'consumption_time',
        dir: 'asc'
      })
      .then((d) => {
        if (!live) return;
        setDayRecords(d);
        setRecordsLoading(false);
      })
      .catch(() => live && setRecordsLoading(false));
    return () => {
      live = false;
    };
  }, [reload, viewDate]);

  useEffect(() => {
    document.title = 'Callista · dashboard';
  }, []);

  useEffect(() => {
    api
      .consumptionMeta()
      .then((m) => setMilkItem(m.defaultItem || ''))
      .catch(() => setMilkItem(''));
  }, []);

  useEffect(() => {
    let live = true;
    setMatrixLoading(true);
    const params = {};
    if (weekOffset) params.week = weekOffset;
    api
      .summaryMatrix(JSON.stringify(params) === '{}' ? undefined : params)
      .then((d) => {
        if (!live) return;
        setMatrix(d);
        setMatrixLoading(false);
      })
      .catch(() => live && setMatrixLoading(false));
    return () => {
      live = false;
    };
  }, [reload, weekOffset]);

  useEffect(() => {
    if (milkItem === undefined) return;
    let live = true;
    setFeedsLoading(true);
    const params = {};
    if (milkItem) params.q = milkItem;
    if (dayOffset) params.day = dayOffset;
    api
      .summaryFeeds(JSON.stringify(params) === '{}' ? undefined : params)
      .then((d) => {
        if (!live) return;
        setFeeds(d);
        setFeedsLoading(false);
      })
      .catch(() => live && setFeedsLoading(false));
    return () => {
      live = false;
    };
  }, [reload, milkItem, dayOffset]);

  useEffect(() => {
    if (milkItem === undefined) return;
    let live = true;
    setDailyLoading(true);
    const params = {};
    if (milkItem) params.q = milkItem;
    api
      .summaryDaily(milkItem ? params : undefined)
      .then((d) => {
        if (!live) return;
        setDaily(d);
        setDailyLoading(false);
      })
      .catch(() => live && setDailyLoading(false));
    return () => {
      live = false;
    };
  }, [reload, milkItem]);

  const chartData = daily ? daily.days.map((b) => ({ name: shortDay(b.date), ...b.byUnit })) : [];
  const chartUnits = daily ? collectUnitsOfDays(daily.days) : [];
  const chartTotals = {};
  if (daily) {
    for (const b of daily.days) {
      for (const [u, v] of Object.entries(b.byUnit)) {
        chartTotals[u] = Number(((chartTotals[u] || 0) + Number(v)).toFixed(2));
      }
    }
  }

  // shift a YYYY-MM-DD date by n calendar days (UTC-noon arithmetic)
  const dayShift = (date, n) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const safeClock = (s) => (typeof s === 'string' && /^\d{4}-/.test(s) ? s.slice(11, 16) : '—');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="lede">
            Feeding at a glance — the current week, the latest day in detail, and
            30 days of {milkItem ? 'milk volumes' : 'consumption'}.
          </p>
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            setMatrixLoading(true);
            setFeedsLoading(true);
            setDailyLoading(true);
            setReload((r) => r + 1);
          }}
        >
          Refresh
        </button>
      </div>

      <div className="dash-grid">
        <WeekMatrixCard
          matrix={matrix}
          matrixLoading={matrixLoading}
          weekOffset={weekOffset}
          onWeek={setWeekOffset}
        />

        <DailyFeedsCard
          feeds={feeds}
          feedsLoading={feedsLoading}
          dayOffset={dayOffset}
          onDay={setDayOffset}
          filterName={milkItem || null}
          title="Daily Milk Summary"
        />

        <div className="chart-card">
          <div className="card-head">
            <h2>Last 30 days · Milk</h2>
          </div>
          <div className="sub">
            {daily
              ? `${milkItem ? 'Volume per day' : 'Consumption per day'} · 30-day total ${unitText(
                  chartTotals
                )}`
              : 'Loading…'}
          </div>
          <div className="fade-wrap" style={{ opacity: dailyLoading ? 0.45 : 1 }}>
            {daily && <Chart data={chartData} units={chartUnits} />}
          </div>
        </div>

        <div className="chart-card wide">
          <div className="card-head">
            <h2>Daily Milk &amp; Medecine Consumption</h2>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="pagebtn"
                onClick={() => setViewDate(dayShift(viewDate, -1))}
                title="Previous day"
              >
                ‹ Prev
              </button>
              <input
                type="date"
                className="input"
                style={{ height: 28, padding: '2px 8px', fontSize: 13 }}
                value={viewDate}
                onChange={(e) => e.target.value && setViewDate(e.target.value)}
                aria-label="Pick a day"
              />
              <button
                className="pagebtn"
                onClick={() => setViewDate(dayShift(viewDate, 1))}
                title="Next day"
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="sub">
            {shortDay(viewDate)} · milk and medicine ·{' '}
            {dayRecords
              ? `all ${fmtNum(dayRecords.total)} record${dayRecords.total === 1 ? '' : 's'} of the day, earliest first`
              : 'loading…'}
          </div>
          <div className="fade-wrap" style={{ opacity: recordsLoading ? 0.45 : 1 }}>
            {dayRecords &&
              (dayRecords.rows.length ? (
                <div className="table-wrap" style={{ padding: '6px 0 12px' }}>
                  <table className="matrix">
                    <thead>
                      <tr>
                        <th className="c" style={{ width: 44 }}>
                          No.
                        </th>
                        <th>Item</th>
                        <th className="c">Amount</th>
                        <th className="c">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayRecords.rows.map((r, i) => (
                        <tr key={r.id}>
                          <td className="c rowno">{i + 1}</td>
                          <td className="cell-name">{r.name}</td>
                          <td className="c cell-amount">
                            {fmtNum(r.amount)} {r.measurement}
                          </td>
                          <td className="c cell-amount">{safeClock(r.consumption_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <div className="big">No records that day</div>
                  <div>{shortDay(viewDate)} has nothing logged — use ‹ Prev to go earlier.</div>
                </div>
              ))}
          </div>
        </div>

        {/* NGT change history — read from ngt_history (written by an external
            channel), 5 per page, newest first */}
        <div className="chart-card wide">
          <div className="card-head">
            <h2>NGT Change History</h2>
            <div className="pagebtns">
              <button
                className="pagebtn"
                disabled={ngtLoading || !ngtData || ngtPage <= 1}
                onClick={() => setNgtPage(ngtPage - 1)}
                title="Previous changes"
              >
                ‹ Prev
              </button>
              <button
                className="pagebtn"
                disabled={ngtLoading || !ngtData || ngtPage >= ngtData.pages}
                onClick={() => setNgtPage(ngtPage + 1)}
                title="Later changes"
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="sub">
            {ngtData
              ? `${fmtNum(ngtData.total)} change${ngtData.total === 1 ? '' : 's'} recorded · page ${ngtPage} of ${ngtData.pages} · 5 per page`
              : 'Loading…'}
          </div>
          <div className="fade-wrap" style={{ opacity: ngtLoading ? 0.45 : 1 }}>
            {ngtData &&
              (ngtData.rows.length ? (
                <div className="table-wrap" style={{ padding: '6px 0 12px' }}>
                  <table className="matrix">
                    <thead>
                      <tr>
                        <th className="c" style={{ width: 44 }}>No.</th>
                        <th className="c">Size</th>
                        <th>Changed at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ngtData.rows.map((r, i) => (
                        <tr key={r.id}>
                          <td className="c rowno">{(ngtPage - 1) * 5 + i + 1}</td>
                          <td className="c cell-amount">{r.measurement ?? '—'}</td>
                          <td className="cell-amount">
                            {r.consumption_time
                              ? `${shortDay(r.consumption_time)} · ${r.consumption_time.slice(11, 16)}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <div className="big">No NGT changes recorded yet</div>
                  <div>Entries appear here when the tube change is recorded through the external channel.</div>
                </div>
              ))}
          </div>
        </div>

        <TimelineCard data={timeline} loading={tLoading} />
      </div>
    </>
  );
}

/* care-timeline: CRP values over time with admission/discharge markers */

function TimelineCard({ data, loading }) {
  const [range, setRange] = useState('6'); // months to look back; '' = all
  const cutoff = range
    ? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - Number(range));
        return d.getTime();
      })()
    : null;

  const points = (data?.crp || [])
    .filter((c) => !cutoff || c.ts >= cutoff)
    .map((c) => ({
      ts: c.ts,
      value: c.value,
      abnormal: c.abnormal,
      title: c.title
    }));
  const admissions = (data?.admissions || []).filter((t) => !cutoff || t >= cutoff);
  const discharges = (data?.discharges || []).filter((t) => !cutoff || t >= cutoff);

  const all = [...points.map((p) => p.ts), ...admissions, ...discharges];
  const domain = all.length ? [Math.min(...all) - 864e5, Math.max(...all) + 864e5] : undefined;
  const monthTick = (t) => {
    const d = new Date(t);
    return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  };

  return (
    <div className="chart-card wide">
      <div className="card-head">
        <h2>Care timeline</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div className="chipline">
            <span className="chip" style={{ background: 'var(--amber-fill)', color: 'var(--amber)' }}>A · admitted</span>
            <span className="chip">D · discharged</span>
          </div>
          <select
            className="select"
            style={{ height: 30, padding: '2px 8px', fontSize: 13 }}
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Timeline range"
          >
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="9">Last 9 months</option>
            <option value="12">Last 1 year</option>
            <option value="">All</option>
          </select>
        </div>
      </div>
      <div className="sub">
        {data
          ? `C-Reactive Protein (mg/L) with hospital episodes marked · ${points.length} CRP results in range`
          : 'Loading…'}
      </div>
      <div className="fade-wrap" style={{ opacity: loading ? 0.45 : 1, height: 280 }}>
        {data &&
          (points.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 18, right: 10, left: -6, bottom: 0 }}>
                <CartesianGrid stroke="#e4eee9" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={domain}
                  tickCount={6}
                  tickFormatter={monthTick}
                  tick={{ fontSize: 11, fill: '#7d938b' }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#7d938b' }} width={40} />
                <Tooltip
                  labelFormatter={(t) => fmtShortDate(new Date(t))}
                  formatter={(v) => [`${v} mg/L`, 'C-Reactive Protein']}
                  labelStyle={{ fontWeight: 600 }}
                />
                {(data?.admissions || []).map((t, i) => (
                  <ReferenceLine
                    key={`a${i}`}
                    x={t}
                    stroke="#b97b1c"
                    strokeDasharray="5 3"
                    label={{ value: 'A', position: 'insideTopLeft', fill: '#b97b1c', fontSize: 10 }}
                  />
                ))}
                {(data?.discharges || []).map((t, i) => (
                  <ReferenceLine
                    key={`d${i}`}
                    x={t}
                    stroke="#1f6f5c"
                    strokeDasharray="2 3"
                    label={{ value: 'D', position: 'insideTopLeft', fill: '#1f6f5c', fontSize: 10 }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#1f6f5c"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#1f6f5c' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">
              <div className="big">No C-Reactive Protein results yet</div>
              <div>The timeline appears once CRP results are imported from lab reports.</div>
            </div>
          ))}
      </div>
    </div>
  );
}