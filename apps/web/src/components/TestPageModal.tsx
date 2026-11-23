'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { GRADE_TEXT, LAB_METRICS, formatMetric, type Grade, type SpeedJob, type SpeedPoint, type Strategy } from '@/lib/speed';

const GRADE_MARK: Record<Grade, string> = { good: '✓', 'needs-improvement': '!', poor: '✕' };
const hostOf = (u: string) => { try { return new URL(u).host + (new URL(u).pathname === '/' ? '' : new URL(u).pathname); } catch { return u; } };

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</>;
}

/** Test any public page now. Shows progress while it runs and the numbers when it is done. */
export function TestPageModal({ open, onClose, url, onUrl, suggestions, canStart, notConfigured, job, running, startedAt, error, onRun, onNew, onOpenInPage }: {
  open: boolean; onClose: () => void;
  url: string; onUrl: (v: string) => void; suggestions: string[];
  canStart: boolean; notConfigured: boolean;
  job: SpeedJob | null; running: boolean; startedAt: number | null; error: string;
  onRun: () => void; onNew: () => void; onOpenInPage: (url: string) => void;
}) {
  const finished = job !== null && (job.status === 'done' || job.status === 'failed');
  const points = (['mobile', 'desktop'] as Strategy[]).map((st) => {
    const r = job?.results.find((x) => x.strategy === st);
    return { st, ok: r?.ok ?? false, error: r?.error, point: r?.point ? ({ ...r.point, day: '', trigger: 'manual' } as SpeedPoint) : null };
  });

  return (
    <Modal open={open} onClose={onClose} title="Test a page" wide={finished && job?.status === 'done'}>
      {!job && (
        <form onSubmit={(e) => { e.preventDefault(); if (canStart) onRun(); }}>
          <p className="muted">Runs a fresh test on mobile and desktop and saves it. Takes about a minute. Use any public page, not only the ones checked every day.</p>
          <label className="field"><span>Page address</span>
            <input data-autofocus type="text" inputMode="url" list="test-page-urls" placeholder="https://example.com/page" value={url} onChange={(e) => onUrl(e.target.value)} autoComplete="off" />
            <datalist id="test-page-urls">{suggestions.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          {notConfigured && <p className="notice" role="status">Speed tests are not connected yet. An admin needs to add the PageSpeed API key.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!canStart}><Icon name="speed" size={14} />Run test</button>
          </div>
        </form>
      )}

      {job && running && (
        <div role="status" className="test-running">
          <span className="spinner" aria-hidden="true" />
          <div>
            <b>Testing {hostOf(job.url)}</b>
            <p className="muted">Mobile first, then desktop. About 30 to 60 seconds each. {startedAt !== null && <>Running for <Elapsed since={startedAt} />.</>}</p>
            <p className="muted">You can close this window. The page shows when the test is done.</p>
            <ul className="steps">
              {points.map((p) => {
                const state = p.point || p.error ? (p.ok ? 'done' : 'failed') : (points.find((q) => !q.point && !q.error)?.st === p.st ? 'now' : 'wait');
                return <li key={p.st} className={state}><i aria-hidden="true">{state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'now' ? '…' : '·'}</i>{p.st === 'mobile' ? 'Mobile' : 'Desktop'}</li>;
              })}
            </ul>
          </div>
          <div className="modal-actions"><button type="button" onClick={onClose}>Close, keep testing</button></div>
        </div>
      )}

      {job && finished && (
        <div>
          {job.status === 'failed' && <p className="error" role="alert">The test failed: {job.error ?? job.results.find((r) => r.error)?.error ?? 'unknown reason'}</p>}
          {job.status === 'done' && (
            <>
              <p role="status" className="success"><Icon name="check" size={16} /> Done. {hostOf(job.url)} was tested just now and the result is saved.</p>
              <div className="table-scroll">
                <table className="test-table">
                  <thead><tr><th>Measure</th><th>Mobile</th><th>Desktop</th></tr></thead>
                  <tbody>
                    {LAB_METRICS.map((m) => (
                      <tr key={m.key}>
                        <th scope="row">{m.label}</th>
                        {points.map((p) => {
                          if (!p.point) return <td key={p.st} className="muted">{p.error ? 'Failed' : '–'}</td>;
                          const g = m.grade(p.point);
                          return <td key={p.st}><b>{formatMetric(m.read(p.point), m.unit)}</b>{g && <span className={`grade ${g}`}><i aria-hidden="true">{GRADE_MARK[g]}</i>{GRADE_TEXT[g]}</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {points.some((p) => p.error) && <p className="notice" role="status">{points.filter((p) => p.error).map((p) => `${p.st === 'mobile' ? 'Mobile' : 'Desktop'} failed: ${p.error}`).join(' ')}</p>}
              <p className="muted">Test-run numbers come from one run of Google Lighthouse, so the score can move by 5 to 10 points between runs.</p>
            </>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onNew}>Test another page</button>
            {job.status === 'done' && <button type="button" onClick={() => onOpenInPage(job.url)}>Open in Core Web Vitals</button>}
            <button type="button" className="primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
