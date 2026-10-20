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

export const UNIT_COLORS = ['#1F6F5C', '#D9962E', '#AB4660', '#4E7C94', '#7A5EA6'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------- formatting ---------- */

export function fmtNum(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function unitText(byUnit) {
  return (
    Object.entries(byUnit)
      .map(([u, v]) => `${fmtNum(v)} ${u}`)
      .join(' · ') || '—'
  );
}

export function shortDay(date) {
  if (!date) return '';
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function dayNum(date) {
  return Number(date.split('-')[2]);
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

export function whenLabel(s) {
  // "2026-10-14 09:05" -> "14 Oct · 09:05"
  const [date, time] = s.split(' ');
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} · ${time}`;
}

export function collectUnits(data) {
  const set = new Set();
  for (const sec of ['daily', 'weekly', 'monthly']) {
    for (const b of data[sec]) for (const u of Object.keys(b.byUnit || {})) set.add(u);
  }
  return [...set].sort();
}

export function collectUnitsOfDays(days) {
  const set = new Set();
  for (const b of days) for (const u of Object.keys(b.byUnit || {})) set.add(u);
  return [...set].sort();
}

/* ---------- stat band ---------- */

export function StatBand({ data }) {
  const unitSums = (byUnit) =>
    Object.entries(byUnit)
      .map(([u, v]) => `${fmtNum(v)} ${u}`)
      .join('  ·  ') || '—';
  const w = data.cartWeekly[data.cartWeekly.length - 1] || { carts: 0, items: 0 };

  return (
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
  );
}

/* ---------- charts ---------- */

export function Chart({ data, units }) {
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

/* ---------- "This week" card ---------- */

// Items as rows, Sun..Sat as columns, cells like "100 ml" or "-".
// Paging refetches only this card.
export function WeekMatrixCard({ matrix, matrixLoading, weekOffset, onWeek, filterName }) {
  const active = matrix || { dates: [], rows: [] };
  return (
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
            onClick={() => onWeek(Math.max(-104, weekOffset - 1))}
            title="Previous week"
          >
            ‹ Prev
          </button>
          <button
            className="pagebtn"
            disabled={weekOffset >= 1}
            onClick={() => onWeek(Math.min(1, weekOffset + 1))}
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
  );
}

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

/* ---------- daily summary card ---------- */

// Feed sessions of one day as time → volume rows, plus the day's totals row.
// Day paging refetches only this card.
export function DailyFeedsCard({ feeds, feedsLoading, dayOffset, onDay, filterName, title }) {
  return (
    <div className="chart-card">
      <div className="card-head">
        <h2>{title}</h2>
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
        {feeds
          ? `${dayOffset === 0 ? 'Most recent day with records' : `${dayOffset} record-day${dayOffset === 1 ? '' : 's'} back`} · ${shortDay(feeds.date)} · sessions within ${feeds.cartWindowMinutes} min`
          : 'Loading…'}
      </div>
      <div className="fade-wrap" style={{ opacity: feedsLoading ? 0.45 : 1 }}>
        {feeds && <DailyFeeds feeds={feeds} filterName={filterName} />}
      </div>
    </div>
  );
}

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

  // day totals across all listed sessions
  const totals = {};
  for (const r of feeds.rows) {
    for (const [u, v] of Object.entries(r.byUnit)) {
      totals[u] = Number(((totals[u] || 0) + Number(v)).toFixed(2));
    }
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
          <tr className="total-row">
            <td className="cell-amount">Total</td>
            <td className="c cell-amount">{unitText(totals)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------- shopping-cart style summaries ---------- */

export function CartRows({ buckets, isWeek }) {
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

export function CartDetail({ carts }) {
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