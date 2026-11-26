'use client';

import { Hint } from '@/components/Hint';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Ga4Panel } from '@/components/Ga4Panel';
import { ConnectionSettings } from '@/components/ConnectionSettings';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/date';

type RunResult = { breakdown: string; outcome: string; error: string | null; rows: number | null };
type Run = {
  id: string; trigger: string; status: string; startedAt: string; finishedAt: string | null;
  callsUsed: number; rateLimited: boolean; error: string | null; results: RunResult[];
};
type Status = {
  configured: boolean; enabled: boolean; callsUsedRecent: number; dailyLimit: number; remainingNow: number; paused: boolean;
  daysOfData: number; firstDay: string | null; lastDay: string | null; lastRun: Run | null;
};
type Snapshot = {
  id: string; date: string; window: string; breakdown: string; fetchedAt: string; metricNames: string[]; rowCount: number;
};

const BREAKDOWNS = ['none', 'url', 'channel', 'source', 'device', 'country', 'os'];
const fmt = fmtDateTime;

export default function DataSources() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [picked, setPicked] = useState<string[]>(['none']);
  const [raw, setRaw] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, n] = await Promise.all([
        api<Status>('/analytics/clarity/status'),
        api<Run[]>('/analytics/clarity/runs'),
        api<Snapshot[]>('/analytics/clarity/snapshots?limit=30'),
      ]);
      setStatus(s); setRuns(r); setSnaps(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method: 'POST', body: body ?? {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function showRaw(id: string) {
    const s = await api<{ payload: unknown }>(`/analytics/clarity/snapshots/${id}`);
    setRaw(JSON.stringify(s.payload, null, 2).slice(0, 20000));
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (user?.role !== 'admin') return <p>Admins only.</p>;

  return (
    <>
      <h1>Data sources</h1>
      <Hint>Admin only. This page shows whether the dashboard is receiving data from Microsoft Clarity and Google Analytics, when it last synced, and lets you refresh by hand. Normally nothing needs doing here: the syncs run every night by themselves.</Hint>
      {user?.superAdmin && <ConnectionSettings />}
      <h2>Microsoft Clarity</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {status && (
        <div className="card">
          <p>
            Token: <strong>{status.configured ? 'set' : 'missing'}</strong> · Nightly sync:{' '}
            <strong>{status.enabled ? 'on (00:05 UTC)' : 'off'}</strong>
          </p>
          <p>
            Calls used in the last 24 hours: <strong>{status.callsUsedRecent} of {status.dailyLimit}</strong> (the nightly job leaves 3 spare)
            {status.paused && <span className="error"> · paused for an hour after Clarity refused a call</span>}
          </p>
          <p>
            Days of data: <strong>{status.daysOfData}</strong>
            {status.firstDay && <> ({fmtDate(status.firstDay)} to {fmtDate(status.lastDay)})</>}
          </p>
          {!status.configured && (
            <p className="error">Save the Clarity token under Connections above.</p>
          )}
        </div>
      )}

      <div className="card">
        <strong>Manual refresh</strong>
        <Hint label="About manual refresh">Each ticked breakdown uses one of the 10 calls allowed per rolling 24 hours. Stores the last 24 hours as today&apos;s rolling snapshot.</Hint>
        <div className="row">
          {BREAKDOWNS.map((b) => (
            <label key={b} style={{ margin: 0 }}>
              <input type="checkbox" checked={picked.includes(b)} onChange={(e) => setPicked(e.target.checked ? [...picked, b] : picked.filter((x) => x !== b))} /> {b}
            </label>
          ))}
        </div>
        <p className="row">
          <button className="primary" disabled={busy || !status?.configured || picked.length === 0} onClick={() => act('/analytics/clarity/sync', { breakdowns: picked })}>
            Sync now
          </button>
          <button disabled={busy || !status?.configured} onClick={() => act('/analytics/clarity/probe')}>
            Run probe (1 call, 72 hours, keeps the raw response)
          </button>
        </p>
      </div>

      <h3>Recent runs</h3>
      <Hint>Each row is one attempt to fetch data. “success” is good; “partial” means some parts failed; “failed” means nothing arrived. Clarity allows only 10 requests per 24 hours, so “Calls” shows how many each run used.</Hint>
      <div className="table-scroll"><table>
        <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>Calls</th><th>Results</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{fmt(r.startedAt)}</td><td>{r.trigger}</td>
              <td>{r.status}{r.rateLimited && ' (limit reached)'}</td><td>{r.callsUsed}</td>
              <td>
                {r.results.map((x) => (
                  <div key={x.breakdown} className={x.outcome === 'error' ? 'error' : undefined}>
                    {x.breakdown}: {x.outcome}{x.rows != null && ` (${x.rows} rows)`}{x.error && ` – ${x.error}`}
                  </div>
                ))}
                {r.error && <div className="error">{r.error}</div>}
              </td>
            </tr>
          ))}
          {runs.length === 0 && <tr><td colSpan={5} className="muted">No runs yet.</td></tr>}
        </tbody>
      </table></div>

      <h3>Stored snapshots</h3>
      <Hint>The raw data saved from Clarity, one row per day and breakdown. Charts are built from these. They are kept so numbers can be re-checked later.</Hint>
      <div className="table-scroll"><table>
        <thead><tr><th>Date (UTC)</th><th>Window</th><th>Breakdown</th><th>Metrics</th><th>Rows</th><th /></tr></thead>
        <tbody>
          {snaps.map((s) => (
            <tr key={s.id}>
              <td>{fmtDate(s.date)}</td><td>{s.window}</td><td>{s.breakdown}</td>
              <td className="muted">{s.metricNames.join(', ')}</td><td>{s.rowCount}</td>
              <td><button onClick={() => showRaw(s.id)}>View raw</button></td>
            </tr>
          ))}
          {snaps.length === 0 && <tr><td colSpan={6} className="muted">Nothing stored yet.</td></tr>}
        </tbody>
      </table></div>
      {raw && (
        <>
          <p className="row"><strong>Raw response</strong><button onClick={() => setRaw('')}>Close</button></p>
          <pre style={{ maxHeight: 400, fontSize: 12 }}>{raw}</pre>
        </>
      )}
      <Ga4Panel />
    </>
  );
}
