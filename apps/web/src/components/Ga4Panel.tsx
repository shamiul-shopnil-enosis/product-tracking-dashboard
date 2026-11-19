'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApiData } from '@/lib/useApi';
import { Hint } from './Hint';
import { fmtDate, fmtDateTime } from '@/lib/date';

type Result = { breakdown: string; outcome: string; error: string | null; rows: number | null };
type Run = { id: string; trigger: string; status: string; startedAt: string; callsUsed: number; error: string | null; results: Result[] };
type Status = {
  configured: boolean; problem: string | null; enabled: boolean; daysOfData: number; firstDay: string | null; lastDay: string | null; lastRun: Run | null;
};

/** GA4 connection status and manual sync, for admins. */
export function Ga4Panel() {
  const status = useApiData<Status>('/analytics/ga4/status');
  const runs = useApiData<Run[]>('/analytics/ga4/runs');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = status.data;

  async function sync(days: number) {
    setBusy(true);
    setError('');
    try {
      await api('/analytics/ga4/sync', { method: 'POST', body: { days } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
      status.reload();
      runs.reload();
    }
  }

  return (
    <section aria-label="Google Analytics">
      <h2>Google Analytics (GA4)</h2>
      {s && (
        <div className="card flush">
          <p>Connection: <strong>{s.configured ? 'ready' : 'not connected'}</strong> · Nightly sync: <strong>{s.enabled ? 'on (03:15 UTC)' : 'off'}</strong></p>
          {!s.configured && s.problem && <p className="error">{s.problem}. Put the key at <code>secrets/ga4.json</code>, set <code>GA4_PROPERTY_ID</code> in <code>.env</code>, then recreate the api container.</p>}
          <p>Days of data: <strong>{s.daysOfData}</strong>{s.firstDay && <> ({fmtDate(s.firstDay)} to {fmtDate(s.lastDay)})</>}</p>
          <Hint label="How syncing works">GA4 can return history, so the first sync reads the last 90 days. After that the last 3 days are re-read each night because GA4 revises recent days.</Hint>
          <p className="row">
            <button className="primary" disabled={busy || !s.configured} onClick={() => sync(3)}>Sync last 3 days</button>
            <button disabled={busy || !s.configured} onClick={() => sync(30)}>Sync last 30 days</button>
            <button disabled={busy || !s.configured} onClick={() => sync(90)}>Backfill 90 days</button>
          </p>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <h3>Recent GA4 runs</h3>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th className="num">Reports</th><th>Results</th></tr></thead>
          <tbody>
            {(runs.data ?? []).map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.startedAt)}</td><td>{r.trigger}</td><td>{r.status}</td><td className="num">{r.callsUsed}</td>
                <td>
                  {r.results.map((x) => <div key={x.breakdown} className={x.outcome === 'error' ? 'error' : undefined}>{x.breakdown}: {x.outcome}{x.rows != null && ` (${x.rows} days)`}{x.error && ` – ${x.error}`}</div>)}
                  {r.error && <div className="error">{r.error}</div>}
                </td>
              </tr>
            ))}
            {runs.data?.length === 0 && <tr><td colSpan={5} className="muted">No runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
