import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { SimplePager, fmtDMY, withinBucket } from '../components/DashCards';

const labelOf = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};
const PAGE_SIZE = 24;
const BUCKETS = [
  { v: '30', label: 'Last 30 days' },
  { v: '60', label: 'Last 60 days' },
  { v: '90', label: 'Last 90 days' },
  { v: '365', label: 'Last 1 year' }
];
const BLANK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#dbe6e0"/></svg>'
);

export default function Food() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState('');
  const [bucket, setBucket] = useState('30');
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState(null); // photo object, or null

  useEffect(() => {
    document.title = 'Callista · Food Report';
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const esc = (e) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [lightbox]);

  useEffect(() => {
    let live = true;
    api
      .food({ limit: 500 })
      .then((d) => live && setPhotos(d.photos))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [bucket]);

  const filtered = useMemo(
    () => (photos || []).filter((p) => withinBucket(p.taken_at, bucket || null)),
    [photos, bucket]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Food Report</h1>
          <p className="lede">
            {photos
              ? `${photos.length} meal photo${photos.length === 1 ? '' : 's'} saved — each is tagged with its day and meal.`
              : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Period">
          {BUCKETS.map((b) => (
            <option key={b.v} value={b.v}>{b.label}</option>
          ))}
        </select>
        <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
          {photos ? `${filtered.length} photo${filtered.length === 1 ? '' : 's'} in range` : ''}
        </span>
      </div>

      {error && <div className="flash err">{error}</div>}

      {photos && filtered.length === 0 && (
        <div className="empty">
          <div className="big">No meal photos in this period</div>
          <div>Photos arrive from the dietary assistant and appear here as they are saved.</div>
        </div>
      )}

      <div className="food-grid">
        {slice.map((p) => (
          <button
            type="button"
            className="photo-card"
            key={p.id}
            onClick={() => setLightbox(p)}
            title="Show full photo"
          >
            <img
              src={`/api/food/photo/${p.id}`}
              alt={`${labelOf[p.meal] || 'Meal'} photo`}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = BLANK;
              }}
            />
            <div className="photo-overlay">
              <span className="ph-date">{fmtDMY(p.taken_at) || fmtDMY(p.created_at)}</span>
              <span className={`ph-meal meal-${p.meal || 'snack'}`}>{labelOf[p.meal] || 'Meal'}</span>
            </div>
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Full photo">
          <button type="button" className="lb-x" onClick={() => setLightbox(null)} aria-label="Close">✕</button>
          <img
            src={`/api/food/photo/${lightbox.id}`}
            alt={`${labelOf[lightbox.meal] || 'Meal'} photo, full view`}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="lb-caption" onClick={(e) => e.stopPropagation()}>
            <span className="ph-date">{fmtDMY(lightbox.taken_at) || fmtDMY(lightbox.created_at)}</span>
            <span className={`ph-meal meal-${lightbox.meal || 'snack'}`}>{labelOf[lightbox.meal] || 'Meal'}</span>
          </div>
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="card" style={{ marginTop: 14, padding: '10px 16px' }}>
          <SimplePager
            page={safePage}
            pages={pages}
            setPage={setPage}
            info={`page ${safePage} of ${pages} · ${filtered.length} photo${filtered.length === 1 ? '' : 's'} · 24 per page`}
          />
        </div>
      )}
    </>
  );
}