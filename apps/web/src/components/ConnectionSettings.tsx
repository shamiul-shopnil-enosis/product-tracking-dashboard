'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Hint } from './Hint';
import { Icon } from './Icon';
import { api, ApiError } from '@/lib/api';

type Source = 'screen' | 'server' | 'none';
type View = {
  site: { name: string; url: string };
  clarity: { configured: boolean; source: Source };
  ga4: { savedHere: boolean; propertyId: string; clientEmail: string | null; keySource: 'screen' | 'file' | 'none'; configured: boolean; problem: string | null };
  pagespeed: { configured: boolean; source: Source };
};

const where = (s: Source) => (s === 'screen' ? 'saved here' : s === 'server' ? 'set on the server' : 'not set');

/** Which site this dashboard is about and the keys that connect it. Secrets can be replaced but are never shown. */
export function ConnectionSettings() {
  const [view, setView] = useState<View | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [property, setProperty] = useState('');
  const [keyFile, setKeyFile] = useState<{ name: string; text: string } | null>(null);
  const [psi, setPsi] = useState('');

  const load = useCallback(async () => {
    try {
      const v = await api<View>('/settings');
      setView(v); setName(v.site.name); setUrl(v.site.url); setProperty(v.ga4.propertyId);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Could not load the settings' });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<View>, done: string, after?: () => void) {
    setBusy(true); setNote(null);
    try {
      setView(await fn());
      setNote({ ok: true, text: done });
      after?.();
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError || e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }
  const put = (path: string, body: unknown) => api<View>(path, { method: 'PUT', body });
  const del = (path: string) => api<View>(path, { method: 'DELETE' });

  async function pickKey(file: File | undefined) {
    if (!file) { setKeyFile(null); return; }
    if (file.size > 20_000) { setNote({ ok: false, text: 'That file is too large to be a service-account key.' }); return; }
    setKeyFile({ name: file.name, text: await file.text() });
  }

  if (!view) return note ? <p className="error" role="alert">{note.text}</p> : <p className="muted">Loading…</p>;

  return (
    <section aria-label="Connections">
      <h2>Connections</h2>
      <Hint>Which site this dashboard is about, and the keys that connect it to Clarity, Google Analytics and PageSpeed. Keys you save here are stored encrypted and can be replaced but never read back. To show another site, change the name here and replace the Clarity token, the GA4 property and its key file. Existing history stays in the database, so back up or use a fresh install for a different site.</Hint>
      {note && <p className={note.ok ? 'success' : 'error'} role={note.ok ? 'status' : 'alert'}>{note.ok && <Icon name="check" size={16} />} {note.text}</p>}

      <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => put('/settings/site', { name, url }), 'Site details saved.'); }}>
        <strong>Site</strong>
        <div className="form-grid">
          <label className="field"><span>Site name</span><input type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
          <label className="field"><span>Web address (optional)</span><input type="text" inputMode="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" /></label>
          <button className="primary" disabled={busy}>Save</button>
        </div>
      </form>

      <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => put('/settings/clarity', { token }), 'Clarity token saved. Data arrives with the next sync, or press “Sync now” below.', () => setToken('')); }}>
        <strong>Microsoft Clarity</strong>
        <p className="muted">API token: <b>{where(view.clarity.source)}</b>. Create one in Clarity under Settings, Data Export. A token belongs to one Clarity project.</p>
        <div className="form-grid">
          <label className="field"><span>{view.clarity.configured ? 'Replace the token' : 'API token'}</span><input type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
          <button className="primary" disabled={busy || !token}>Save token</button>
          {view.clarity.source === 'screen' && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/clarity'), 'Saved token removed.')}>Remove saved token</button>}
        </div>
      </form>

      <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => put('/settings/ga4', { propertyId: property || undefined, keyJson: keyFile?.text }), 'Google Analytics details saved. Data arrives with the next sync.', () => setKeyFile(null)); }}>
        <strong>Google Analytics (GA4)</strong>
        <p className="muted">
          Status: <b>{view.ga4.configured ? 'connected' : 'not ready'}</b>{view.ga4.problem && <> · {view.ga4.problem}</>}. Key: <b>{view.ga4.keySource === 'screen' ? 'saved here' : view.ga4.keySource === 'file' ? 'file on the server' : 'not set'}</b>.
          {view.ga4.clientEmail && <> The service account is <code>{view.ga4.clientEmail}</code>. It needs the Viewer role on the GA4 property.</>}
        </p>
        <div className="form-grid">
          <label className="field"><span>Property ID</span><input type="text" inputMode="numeric" placeholder="490022412" value={property} onChange={(e) => setProperty(e.target.value)} autoComplete="off" /></label>
          <label className="field"><span>Service-account key file (.json)</span><input type="file" accept="application/json,.json" onChange={(e) => void pickKey(e.target.files?.[0])} /></label>
          <button className="primary" disabled={busy || (!keyFile && (!property || property === view.ga4.propertyId))}>Save</button>
          {view.ga4.savedHere && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/ga4'), 'Saved Google Analytics details removed.')}>Remove saved details</button>}
        </div>
        {keyFile && <p className="muted">Ready to save: {keyFile.name}. Its contents are sent once and stored encrypted.</p>}
      </form>

      <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(() => put('/settings/pagespeed', { apiKey: psi }), 'PageSpeed key saved.', () => setPsi('')); }}>
        <strong>PageSpeed (Core Web Vitals)</strong>
        <p className="muted">API key: <b>{where(view.pagespeed.source)}</b>. A free Google API key with the PageSpeed Insights API enabled.</p>
        <div className="form-grid">
          <label className="field"><span>{view.pagespeed.configured ? 'Replace the key' : 'API key'}</span><input type="password" required autoComplete="off" value={psi} onChange={(e) => setPsi(e.target.value)} /></label>
          <button className="primary" disabled={busy || !psi}>Save key</button>
          {view.pagespeed.source === 'screen' && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/pagespeed'), 'Saved key removed.')}>Remove saved key</button>}
        </div>
      </form>
    </section>
  );
}
