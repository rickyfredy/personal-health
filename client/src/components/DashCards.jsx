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
  // works for both pure dates ("2026-10-25") and datetimes ("2026-10-25 23:43:58")
  const [, m, d] = String(date).split(' ')[0].split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// "02 Jul 2026" — record/heading style
export function fmtShortDate(s) {
  const hit = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!hit) return '';
  return `${hit[3]} ${MONTHS[Number(hit[2]) - 1]} ${hit[1]}`;
}

// "02-07-2026" — for data rows inside a record
export function fmtDMY(s) {
  const hit = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!hit) return '';
  return `${hit[3]}-${hit[2]}-${hit[1]}`;
}

// date-bucket filter: months = null -> all; "dateStr" = "YYYY-MM-DD( HH:mm:ss)"
export function withinBucket(dateStr, months) {
  if (!months) return true;
  const hit = /(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!hit) return false;
  const d = new Date(Date.UTC(Number(hit[1]), Number(hit[2]) - 1, Number(hit[3])));
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - Number(months));
  return d >= cutoff;
}

// shared ‹ Prev / Next › pager
export function SimplePager({ page, pages, setPage, disabled, info }) {
  return (
    <div className="pagebtns">
      <button className="pagebtn" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>
        ‹ Prev
      </button>
      <button className="pagebtn" disabled={disabled || page >= pages} onClick={() => setPage(page + 1)}>
        Next ›
      </button>
      {info && <span style={{ color: 'var(--ink-faint)', fontSize: 12.5, marginLeft: 6 }}>{info}</span>}
    </div>
  );
}

export function dayNum(date) {
  return Number(date.split('-')[2]);
}

export function collectUnitsOfDays(days) {
  const set = new Set();
  for (const b of days) for (const u of Object.keys(b.byUnit || {})) set.add(u);
  return [...set].sort();
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
            <th className="c" style={{ width: 44 }}>No.</th>
            <th>Feed time</th>
            <th className="c">Volume</th>
          </tr>
        </thead>
        <tbody>
          {feeds.rows.map((r, i) => (
            <tr key={r.time}>
              <td className="c rowno">{i + 1}</td>
              <td className="cell-amount">{r.time}</td>
              <td className="c cell-amount">
                {unitText(r.byUnit) === '—' ? '-' : unitText(r.byUnit)}
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td className="c" />
            <td className="cell-amount">Total</td>
            <td className="c cell-amount">{unitText(totals)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------- summary: end of shared cards ---------- */