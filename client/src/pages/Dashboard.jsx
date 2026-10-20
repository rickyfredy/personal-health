import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  Chart,
  DailyFeedsCard,
  WeekMatrixCard,
  collectUnitsOfDays,
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

  const milkLabel = milkItem || 'all items';
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
          title={milkItem ? `Daily ${milkItem} summary` : 'Daily feeds'}
        />

        <div className="chart-card">
          <div className="card-head">
            <h2>{milkItem ? `Last 30 days · ${milkLabel}` : 'Last 30 days'}</h2>
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
      </div>
    </>
  );
}