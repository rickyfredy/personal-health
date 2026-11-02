import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { SimplePager, fmtDMY, withinBucket } from '../components/DashCards';

const MEALS = ['lunch', 'dinner', 'snack'];
const labelOf = (m) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');
const PAGE_SIZE = 24;

const BUCKETS = [
  { v: '30', label: 'Last 30 days' },
  { v: '60', label: 'Last 60 days' },
  { v: '90', label: 'Last 90 days' },
  { v: '365', label: 'Last 1 year' }
];

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Food() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [bucket, setBucket] = useState('30');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ meal: 'lunch', when: toLocalInput(new Date()) });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Callista · food report';
  }, []);

  async function load() {
    try {
      const d = await api.food({ limit: 500 });
      setPhotos(d.photos);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
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

  async function save(e) {
    e.preventDefault();
    if (!file) return setMsg('Choose a photo first.');
    setSaving(true);
    setMsg('');
    try {
      const dataUrl = await readFile(file);
      await api.foodUpload({ meal: form.meal, taken_at: form.when, dataUrl });
      setMsg(`${labelOf(form.meal)} photo saved.`);
      setFile(null);
      document.getElementById('food-file').value = '';
      await load();
    } catch (err) {
      setMsg(err.message || 'Could not save the photo.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try {
      await api.foodDelete(id);
      await load();
    } catch {
      setMsg('Could not delete the photo.');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Food report</h1>
          <p className="lede">
            {photos
              ? `${photos.length} meal photo${photos.length === 1 ? '' : 's'} saved — each is tagged with its day and meal.`
              : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Save a meal photo</h2>
        <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select
            className="select"
            value={form.meal}
            onChange={(e) => setForm((f) => ({ ...f, meal: e.target.value }))}
            aria-label="Meal"
            style={{ width: 130 }}
          >
            {MEALS.map((m) => (
              <option key={m} value={m}>{labelOf(m)}</option>
            ))}
          </select>
          <input
            type="datetime-local"
            className="input"
            style={{ width: 220 }}
            value={form.when}
            onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))}
            aria-label="Meal time"
          />
          <input
            id="food-file"
            type="file"
            className="input"
            style={{ height: 38, padding: '6px 10px', maxWidth: 260 }}
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save photo'}
          </button>
        </form>
        {msg && (
          <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith('Could not') ? 'var(--berry)' : 'var(--spruce-deep)' }}>
            {msg}
          </div>
        )}
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
          <div>Save one above — it lands here with its day and meal label.</div>
        </div>
      )}

      <div className="food-grid">
        {slice.map((p) => (
          <div className="photo-card" key={p.id}>
            <img src={`/api/food/photo/${p.id}`} alt={`${labelOf(p.meal)} photo`} loading="lazy" />
            <div className="photo-overlay">
              <span className="ph-date">{fmtDMY(p.taken_at) || fmtDMY(p.created_at)}</span>
              <span className={`ph-meal meal-${p.meal}`}>{labelOf(p.meal)}</span>
            </div>
            <button className="ph-del" onClick={() => remove(p.id)} title="Delete photo" style={{ pointerEvents: 'auto' }}>
              ✕
            </button>
          </div>
        ))}
      </div>

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