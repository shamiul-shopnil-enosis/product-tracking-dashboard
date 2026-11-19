'use client';

import { useCallback, useEffect, useState } from 'react';
import { Guide, Hint } from '@/components/Hint';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { BANDS, BAND_LABEL, REACHES, SEVERITIES, STATUSES, TYPES, type FindingList } from '@/lib/findings';

const EMPTY = { pageUrl: '', q: '', type: '', severity: '', reach: '', status: '', band: '', surface: '', release: '', sort: 'priority' };

function FindingsList() {
  const { user } = useAuth();
  const initialPage = useSearchParams().get('pageUrl') ?? '';
  const [filters, setFilters] = useState({ ...EMPTY, pageUrl: initialPage });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FindingList | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    params.set('page', String(page));
    try {
      setError('');
      setData(await api<FindingList>(`/findings?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load findings');
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce typing in the text filters
    return () => clearTimeout(t);
  }, [load]);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setPage(1);
    setFilters((p) => ({ ...p, [k]: v }));
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <div className="row">
        <h1 style={{ flex: 1 }}>Findings</h1>
        {user && user.role !== 'viewer' && <Link href="/findings/new"><button className="primary">New finding</button></Link>}
      </div>

      <Hint>Findings are problems or ideas your team has noticed by hand (a bug, a confusing screen, a feature request), kept next to the automatic numbers. The list is sorted by priority, so the top row is what to look at first.</Hint>
      {filters.pageUrl && (
        <p className="notice">Showing findings for page {filters.pageUrl}{' '}<button onClick={() => set('pageUrl', '')}>Show all</button></p>
      )}
      <div className="row">
        <input type="text" placeholder="Search title, where, description" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <select aria-label="Type" value={filters.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Severity" value={filters.severity} onChange={(e) => set('severity', e.target.value)}>
          <option value="">Any severity</option>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Reach" value={filters.reach} onChange={(e) => set('reach', e.target.value)}>
          <option value="">Any reach</option>{REACHES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Priority band" value={filters.band} onChange={(e) => set('band', e.target.value)}>
          <option value="">Any priority</option>{BANDS.map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}
        </select>
        <input type="text" placeholder="Area" style={{ width: 120 }} value={filters.surface} onChange={(e) => set('surface', e.target.value)} />
        <input type="text" placeholder="Release" style={{ width: 100 }} value={filters.release} onChange={(e) => set('release', e.target.value)} />
        <select aria-label="Sort" value={filters.sort} onChange={(e) => set('sort', e.target.value)}>
          <option value="priority">Sort: priority</option><option value="newest">Sort: newest</option>
        </select>
        <button onClick={() => { setPage(1); setFilters(EMPTY); }}>Clear</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <Guide items={[
        { term: 'Ref', text: 'The finding’s number, for example F-12.' },
        { term: 'Type', text: 'What kind of finding: bug, usability problem, idea and so on.' },
        { term: 'Sev', text: 'Severity: how bad it is for the person who hits it.' },
        { term: 'Reach', text: 'How many users it affects: one person, some, or everyone.' },
        { term: 'Effort', text: 'Rough size of the work to fix it. Small effort with big impact is the best value.' },
        { term: 'Priority', text: 'Worked out from severity, reach and effort, so the most valuable fixes rise to the top. A person can override it.' },
        { term: 'Status', text: 'Where it is: new, planned, in progress or shipped.' },
      ]} title="What the columns mean" />
      <div className="table-scroll"><table>
        <thead><tr><th>Ref</th><th>Title</th><th>Type</th><th>Sev</th><th>Reach</th><th>Effort</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>
          {data?.items.map((f) => (
            <tr key={f.id}>
              <td>F-{f.ref}</td>
              <td><Link href={`/findings/${f.id}`}>{f.title}</Link><div className="muted">{f.where}</div></td>
              <td>{f.type}</td><td>{f.severity}</td><td>{f.reach}</td><td>{f.effort}</td>
              <td>{BAND_LABEL[f.priority.band]}<div className="muted">score {f.priority.score}</div></td>
              <td>{f.status}{f.plannedRelease && ` (${f.plannedRelease})`}</td>
            </tr>
          ))}
          {data && data.items.length === 0 && <tr><td colSpan={8} className="muted">No findings match.</td></tr>}
        </tbody>
      </table></div>
      {data && (
        <p className="row">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {pages} · {data.total} findings</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </p>
      )}
    </>
  );
}

export default function FindingsPage() {
  return <Suspense fallback={<p className="muted">Loading…</p>}><FindingsList /></Suspense>;
}
