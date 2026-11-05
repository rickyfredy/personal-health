import { useEffect, useRef, useState } from 'react';
import { MONTHS, fmtDMY } from './DashCards';

// Styled date-picker with a real calendar popup (used on the Care timeline).
// Single-date picker: value "YYYY-MM-DD", min/max optional "YYYY-MM-DD" bounds.
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`; // m = 1-indexed

export default function DatePicker({ value, onChange, min, max, label = 'Pick a date' }) {
  const [open, setOpen] = useState(false);
  const init = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewY, setViewY] = useState(init.getFullYear());
  const [viewM, setViewM] = useState(init.getMonth()); // 0-based
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const dim = new Date(viewY, viewM + 1, 0).getDate(); // days in month
  const lead = new Date(viewY, viewM, 1).getDay(); // 0 = Sunday
  const todayStr = ymd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const bounded = (s) => (min && s < min) || (max && s > max);

  function shiftMonth(n) {
    const d = new Date(viewY, viewM + n, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }

  return (
    <span className="dp" ref={boxRef}>
      <button
        type="button"
        className="dp-input"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      >
        {value ? fmtDMY(value) : label}
        <span style={{ opacity: 0.55 }}>▾</span>
      </button>
      {open && (
        <div className="dp-pop" role="dialog" aria-label={label}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <span className="dp-title">{MONTHS[viewM]} {viewY}</span>
            <button type="button" className="dp-nav" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
          </div>
          <div className="dp-grid">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
              <span key={w} className="dp-wd">{w}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={'pad' + i} />
            ))}
            {Array.from({ length: dim }, (_, i) => {
              const d = i + 1;
              const s = ymd(viewY, viewM + 1, d);
              const off = bounded(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={off}
                  className={`dp-day${s === value ? ' sel' : ''}${s === todayStr ? ' today' : ''}`}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <button type="button" className="dp-today" onClick={() => {
              const d = new Date();
              setViewY(d.getFullYear());
              setViewM(d.getMonth());
              onChange(ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()));
              setOpen(false);
            }}>
              Today
            </button>
          </div>
        </div>
      )}
    </span>
  );
}