import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  Chart,
  DailyFeedsCard,
  WeekMatrixCard,
  collectUnitsOfDays,
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

  // mini-cards: lab + discharge totals and latest entries (independent fetches)
  const [labsBrief, setLabsBrief] = useState(null);
  const [dischBrief, setDischBrief] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    api.labs({ limit: 1 }).then((d) => live && setLabsBrief(d)).catch(() => {});
    api.discharge({ limit: 1 }).then((d) => live && setDischBrief(d)).catch(() => {});
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
        <MiniLabCard data={labsBrief} loading={!labsBrief} onClick={() => navigate('/labs')} />
        <MiniDischargeCard data={dischBrief} loading={!dischBrief} onClick={() => navigate('/discharge')} />

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
                          <td className="c cell-amount">{r.consumption_time.slice(11, 16)}</td>
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
      </div>
    </>
  );
}

/* mini-cards linking to the medical pages */

function MiniLabCard({ data, loading, onClick }) {
  const latest = data?.reports?.[0];
  return (
    <div
      className="chart-card mini-link"
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      style={{ opacity: loading ? 0.6 : 1 }}
      title="Open lab results"
    >
      <div className="label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 8 }}>
        Lab reports
      </div>
      <div className="value">{loading ? '…' : fmtN(data.total)}</div>
      <div className="sub">
        {latest
          ? `latest ${shortDay(latest.reported_at)} · ${latest.title?.slice(0, 40)}`
          : 'no reports yet'}
        {data && data.abnormalTotal > 0 && (
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}> · ⚑ {data.abnormalTotal} flagged</span>
        )}
      </div>
    </div>
  );
}

function MiniDischargeCard({ data, loading, onClick }) {
  const latest = data?.records?.[0];
  return (
    <div
      className="chart-card mini-link"
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      style={{ opacity: loading ? 0.6 : 1 }}
      title="Open discharge summaries"
    >
      <div className="label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-faint)', marginBottom: 8 }}>
        Discharges
      </div>
      <div className="value">{loading ? '…' : fmtN(data.total)}</div>
      <div className="sub">
        {latest
          ? `latest ${shortDay(latest.discharged_at)} · ${latest.venue || ''} · ${(latest.primary_dx || '—').split('; ')[0]}`
          : 'no summaries yet'}
      </div>
    </div>
  );
}

function fmtN(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}