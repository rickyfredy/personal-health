import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { SimplePager, fmtDMY, withinBucket } from '../components/DashCards';

const labelOf = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};
const PAGE_SIZE = 100;
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
  const [lightbox, setLightbox] = useState(null); // index into `filtered`, or null

  useEffect(() => {
    document.title = 'Callista · Food Report';
  }, []);

  useEffect(() => {
    let live = true;
    api
      .food({ limit: 2000 })
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
  const current = lightbox !== null ? filtered[lightbox] : null;

  // Lightbox navigation: prev/next across the whole filtered list; when the
  // move crosses a page boundary the pager follows so the grid stays in sync.
  function go(dir) {
    if (lightbox === null) return;
    const n = lightbox + dir;
    if (n < 0 || n >= filtered.length) return;
    setLightbox(n);
    setPage(Math.floor(n / PAGE_SIZE) + 1);
  }

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, filtered]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Food Report</h1>
          <p className="lede">
            {photos
              ? `${photos.length} entr${photos.length === 1 ? 'y' : 'ies'} (photos & videos) saved — each is tagged with its day and meal.`
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
          {photos ? `${filtered.length} in range` : ''}
        </span>
      </div>

      {error && <div className="flash err">{error}</div>}

      {photos && filtered.length === 0 && (
        <div className="empty">
          <div className="big">No meal media in this period</div>
          <div>Photos and videos arrive from the dietary assistant and appear here as they are saved.</div>
        </div>
      )}

      <div className="food-grid">
        {slice.map((p) => (
          <button
            type="button"
            className="photo-card"
            key={p.id}
            onClick={() => setLightbox(filtered.indexOf(p))}
            title="Show full photo"
          >
            <img
              src={`/api/food/thumb/${p.id}`}
              alt={`${labelOf[p.meal] || 'Meal'} ${p.media === 'video' ? 'video' : 'photo'}`}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = BLANK;
              }}
            />
            {p.media === 'video' && <span className="video-badge">▶ Video</span>}
            <div className="photo-overlay">
              <span className="ph-date">{fmtDMY(p.taken_at) || fmtDMY(p.created_at)}</span>
              <span className={`ph-meal meal-${p.meal || 'snack'}`}>{labelOf[p.meal] || 'Meal'}</span>
            </div>
          </button>
        ))}
      </div>

      {current && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Full media viewer">
          <button type="button" className="lb-x" onClick={() => setLightbox(null)} aria-label="Close">✕</button>
          <button
            type="button"
            className="lb-arrow lb-prev"
            aria-label="Previous"
            disabled={lightbox === 0}
            onClick={(e) => { e.stopPropagation(); go(-1); }}
          >
            ‹
          </button>
          <button
            type="button"
            className="lb-arrow lb-next"
            aria-label="Next"
            disabled={lightbox === filtered.length - 1}
            onClick={(e) => { e.stopPropagation(); go(1); }}
          >
            ›
          </button>
          {current.media === 'video' ? (
            <video
              key={current.id}
              src={`/api/food/photo/${current.id}`}
              controls
              playsInline
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              key={current.id}
              src={`/api/food/photo/${current.id}`}
              alt={`${labelOf[current.meal] || 'Meal'} photo, full view`}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="lb-caption" onClick={(e) => e.stopPropagation()}>
            <span className="ph-date">{fmtDMY(current.taken_at) || fmtDMY(current.created_at)}</span>
            <span className={`ph-meal meal-${current.meal || 'snack'}`}>{labelOf[current.meal] || 'Meal'}</span>
            <span className="lb-count">{lightbox + 1} / {filtered.length}</span>
          </div>
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="card" style={{ marginTop: 14, padding: '10px 16px' }}>
          <SimplePager
            page={safePage}
            pages={pages}
            setPage={setPage}
            info={`page ${safePage} of ${pages} · ${filtered.length} photo${filtered.length === 1 ? '' : 's'} · ${PAGE_SIZE} per page`}
          />
        </div>
      )}
    </>
  );
}
