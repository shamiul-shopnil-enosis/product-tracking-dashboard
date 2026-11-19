'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';
import type { Marker } from '@/lib/dashboard';
import { Hint } from './Hint';
import { fmtDate } from '@/lib/date';

const KINDS = ['release', 'campaign', 'incident', 'other'];

export function MarkersPanel({ markers, onChanged }: { markers: Marker[]; onChanged: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, label: '', kind: 'release' });
  const [error, setError] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/annotations', { method: 'POST', body: form });
      setForm({ ...form, label: '' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the marker');
    }
  }

  async function remove(id: string) {
    setError('');
    try {
      await api(`/annotations/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the marker');
    }
  }

  return (
    <details className="card">
      <summary><strong>Chart markers</strong> <span className="muted">({markers.length} in this range)</span></summary>
      <Hint>Mark a release, campaign or incident so you can see what changed around it. Markers appear as dashed lines on the charts.</Hint>
      {markers.map((m) => (
        <div className="row" key={m.id} style={{ marginBottom: 4 }}>
          <span>{fmtDate(m.date)}</span><span className="muted">{m.kind}</span><strong>{m.label}</strong>
          {canEdit && <button onClick={() => remove(m.id)} aria-label={`Remove marker ${m.label}`}>Remove</button>}
        </div>
      ))}
      {canEdit && (
        <form className="row" onSubmit={add} style={{ marginTop: 8 }}>
          <input type="date" required aria-label="Marker date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select aria-label="Marker type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <input type="text" required maxLength={80} aria-label="Marker label" placeholder="e.g. PMD 4.0.0 released" style={{ flex: 1, minWidth: 200 }} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <button className="primary">Add marker</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}
