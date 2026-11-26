'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Hint } from './Hint';
import { Icon } from './Icon';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { switchProfile } from '@/lib/profile';
import { refreshClarityProject } from '@/lib/clarity';

type Source = 'screen' | 'server' | 'none';
type View = {
  site: { name: string; url: string };
  clarity: { configured: boolean; source: Source; projectId: string };
  ga4: { savedHere: boolean; propertyId: string; clientEmail: string | null; keySource: 'screen' | 'file' | 'none'; configured: boolean; problem: string | null };
  pagespeed: { configured: boolean; source: Source };
};

const where = (s: Source) => (s === 'screen' ? 'saved here' : s === 'server' ? 'set on the server' : 'not set');

type Tab = 'site' | 'clarity' | 'ga4' | 'pagespeed';

/** One card per profile: its name and every key that connects it, in tabs. Secrets can be replaced but are never shown. */
export function ConnectionSettings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('site');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [project, setProject] = useState('');
  const [property, setProperty] = useState('');
  const [keyFile, setKeyFile] = useState<{ name: string; text: string } | null>(null);
  const [psi, setPsi] = useState('');

  const load = useCallback(async () => {
    try {
      const v = await api<View>('/settings');
      setView(v); setName(v.site.name); setUrl(v.site.url); setProperty(v.ga4.propertyId); setProject(v.clarity.projectId);
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

  const profiles = user?.profiles ?? [];
  const active = profiles.find((p) => p.id === user?.activeProfileId);

  async function createProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      const p = await api<{ id: string }>('/profiles', { method: 'POST', body: { name: newName } });
      switchProfile(p.id);
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not create the profile' });
      setBusy(false);
    }
  }
  async function archiveProfile() {
    if (!active) return;
    setBusy(true); setNote(null);
    try {
      await api(`/profiles/${active.id}`, { method: 'DELETE' });
      const first = profiles.find((p) => p.isDefault) ?? profiles.find((p) => p.id !== active.id);
      if (first) switchProfile(first.id);
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not archive the profile' });
      setBusy(false);
    }
  }

  if (!view) return note ? <p className="error" role="alert">{note.text}</p> : <p className="muted">Loading…</p>;

  const tabs: { id: Tab; label: string; ok?: boolean }[] = [
    { id: 'site', label: 'Site' },
    { id: 'clarity', label: 'Clarity', ok: view.clarity.configured },
    { id: 'ga4', label: 'Google Analytics', ok: view.ga4.configured },
    { id: 'pagespeed', label: 'PageSpeed', ok: view.pagespeed.configured },
  ];
  const submit = (fn: () => void) => (e: FormEvent) => { e.preventDefault(); fn(); };

  return (
    <section aria-label="Profiles">
      <h2>Profiles</h2>
      <Hint>A profile is one site or product with its own Clarity, Google Analytics and PageSpeed connections, its own data, findings and pages. Pick a profile to work on it; everything in the app follows. Keys you save are stored encrypted and can be replaced but never read back. People only see the profiles you give them access to, under Users.</Hint>
      <div className="profile-bar" role="group" aria-label="Choose a profile">
        <div className="seg">
          {profiles.map((p) => <button key={p.id} type="button" aria-pressed={p.id === active?.id} onClick={() => p.id !== active?.id && switchProfile(p.id)}>{p.name}</button>)}
        </div>
        {!adding && <button type="button" onClick={() => setAdding(true)}><Icon name="plus" size={14} />New profile</button>}
        {adding && (
          <form className="row" onSubmit={createProfile}>
            <input type="text" required maxLength={80} placeholder="Name, for example Geeky Ends" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus aria-label="New profile name" />
            <button className="primary" disabled={busy || !newName.trim()}>Create</button>
            <button type="button" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
          </form>
        )}
      </div>
      {note && <p className={note.ok ? 'success' : 'error'} role={note.ok ? 'status' : 'alert'}>{note.ok && <Icon name="check" size={16} />} {note.text}</p>}

      <div className="card profile-card">
        <div className="profile-card-head">
          <h2>{view.site.name}</h2>
          <span className="muted">{[view.clarity.configured && 'Clarity', view.ga4.configured && 'Google Analytics', view.pagespeed.configured && 'PageSpeed'].filter(Boolean).join(' · ') || 'Nothing connected yet'}</span>
        </div>
        <div className="profile-tabs" role="tablist" aria-label="Connections">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="profile-panel" onClick={() => setTab(t.id)}>
              {t.label}{t.ok !== undefined && <i className={`state${t.ok ? ' ok' : ''}`} aria-label={t.ok ? 'connected' : 'not set'} />}
            </button>
          ))}
        </div>

        <div className="profile-panel" role="tabpanel" id="profile-panel" aria-labelledby={`tab-${tab}`}>
          {tab === 'site' && (
            <>
              <form className="sect" onSubmit={submit(() => void run(() => put('/settings/site', { name, url }), 'Site details saved.'))}>
                <p className="muted">The name appears in the profile list, the sidebar and PDF reports.</p>
                <div className="form-grid">
                  <label className="field"><span>Site name</span><input type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
                  <label className="field"><span>Web address (optional)</span><input type="text" inputMode="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" /></label>
                  <button className="primary" disabled={busy}>Save</button>
                </div>
              </form>
              {active && !active.isDefault && (
                <div className="sect">
                  <strong>Archive this profile</strong>
                  <p className="muted">Hides it from everyone and stops its syncs. Its data is kept.</p>
                  {!confirmArchive
                    ? <div><button type="button" onClick={() => setConfirmArchive(true)}>Archive {view.site.name}</button></div>
                    : <div className="row"><button type="button" className="primary" disabled={busy} onClick={() => void archiveProfile()}>Yes, archive it</button><button type="button" onClick={() => setConfirmArchive(false)}>Cancel</button></div>}
                </div>
              )}
            </>
          )}

          {tab === 'clarity' && (
            <>
              <form className="sect" onSubmit={submit(() => void run(() => put('/settings/clarity', { token }), 'Clarity token saved. Data arrives with the next sync, or press “Sync now” below.', () => setToken('')))}>
                <strong>API token</strong>
                <p className="muted">Token: <b>{where(view.clarity.source)}</b>. Create one in Clarity under Settings, Data Export. A token belongs to one Clarity project.</p>
                <div className="form-grid">
                  <label className="field"><span>{view.clarity.configured ? 'Replace the token' : 'API token'}</span><input type="password" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
                  <button className="primary" disabled={busy || !token}>Save token</button>
                  {view.clarity.source === 'screen' && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/clarity'), 'Saved token removed.')}>Remove saved token</button>}
                </div>
              </form>
              <form className="sect" onSubmit={submit(() => void run(() => put('/settings/clarity-project', { value: project }), 'Clarity project saved. The tables now link to its recordings.', refreshClarityProject))}>
                <strong>Recordings</strong>
                <p className="muted">Project ID: <b>{view.clarity.projectId ? view.clarity.projectId : 'not set'}</b>. Lets the Friction and Pages tables open your project’s recordings. It is the code in your Clarity address, for example the <code>rn41bqeja2</code> in <code>clarity.microsoft.com/player/rn41bqeja2/…</code>. You can paste the whole address.</p>
                <div className="form-grid">
                  <label className="field"><span>Project ID or Clarity address</span><input type="text" maxLength={500} value={project} onChange={(e) => setProject(e.target.value)} autoComplete="off" /></label>
                  <button className="primary" disabled={busy || !project.trim() || project.trim() === view.clarity.projectId}>Save project</button>
                  {view.clarity.projectId && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/clarity-project'), 'Clarity project removed.', refreshClarityProject)}>Remove</button>}
                </div>
              </form>
            </>
          )}

          {tab === 'ga4' && (
            <form className="sect" onSubmit={submit(() => void run(() => put('/settings/ga4', { propertyId: property || undefined, keyJson: keyFile?.text }), 'Google Analytics details saved. Data arrives with the next sync.', () => setKeyFile(null)))}>
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
          )}

          {tab === 'pagespeed' && (
            <form className="sect" onSubmit={submit(() => void run(() => put('/settings/pagespeed', { apiKey: psi }), 'PageSpeed key saved.', () => setPsi('')))}>
              <p className="muted">API key: <b>{where(view.pagespeed.source)}</b>. A free Google API key with the PageSpeed Insights API enabled.</p>
              <div className="form-grid">
                <label className="field"><span>{view.pagespeed.configured ? 'Replace the key' : 'API key'}</span><input type="password" required autoComplete="off" value={psi} onChange={(e) => setPsi(e.target.value)} /></label>
                <button className="primary" disabled={busy || !psi}>Save key</button>
                {view.pagespeed.source === 'screen' && <button type="button" disabled={busy} onClick={() => void run(() => del('/settings/pagespeed'), 'Saved key removed.')}>Remove saved key</button>}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
