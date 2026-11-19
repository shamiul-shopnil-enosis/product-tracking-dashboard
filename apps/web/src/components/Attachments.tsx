'use client';

import { useState, type ChangeEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Attachment, Finding } from '@/lib/findings';

type Props = { findingId: string; items: Attachment[]; canEdit: boolean; onChange: (f: Finding) => void };

export function Attachments({ findingId, items, canEdit, onChange }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/findings/${findingId}/attachments`, { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, data?.message ?? `Upload failed (${res.status})`);
      }
      onChange(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(attId: string) {
    setError('');
    try {
      onChange(await api<Finding>(`/findings/${findingId}/attachments/${attId}`, { method: 'DELETE' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section className="card">
      <strong>Screenshots</strong>
      <p className="muted">PNG, JPG or WebP, up to 5 MB each, 10 per finding. Do not include customer emails or review text.</p>
      <div className="row">
        {items.map((a) => (
          <figure key={a.id} style={{ margin: 0, width: 180 }}>
            <a href={`/api/findings/${findingId}/attachments/${a.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/findings/${findingId}/attachments/${a.id}`} alt={a.filename} style={{ width: 180, height: 120, objectFit: 'cover', border: '1px solid #ddd' }} />
            </a>
            <figcaption className="muted" style={{ wordBreak: 'break-all' }}>{a.filename}</figcaption>
            {canEdit && <button type="button" onClick={() => remove(a.id)}>Remove</button>}
          </figure>
        ))}
        {items.length === 0 && <span className="muted">No screenshots yet.</span>}
      </div>
      {canEdit && (
        <p>
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} />
          {busy && <span className="muted"> Uploading…</span>}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
