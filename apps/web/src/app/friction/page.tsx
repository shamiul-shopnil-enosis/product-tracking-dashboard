'use client';

import { useState } from 'react';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { FindingLinks } from '@/components/FindingLinks';
import { Guide, Hint } from '@/components/Hint';
import { G } from '@/lib/glossary';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { RecordingLink } from '@/components/RecordingLink';
import { TrendChart } from '@/components/TrendChart';
import { formatValue, type Friction, type PageRow } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';
import { PageHead } from '@/components/PageHead';

const SORTS = [
  { value: 'any', label: 'All friction' }, { value: 'quickback', label: 'Quick backs' }, { value: 'dead', label: 'Dead clicks' },
  { value: 'rage', label: 'Rage clicks' }, { value: 'scriptError', label: 'Script errors' },
];
const cell = (c: PageRow['rage']) => (c.affected ? `${c.affected} (${formatValue(c.rate, 'percent')})` : '0');
const path = (url: string) => { try { const u = new URL(url); return u.pathname + u.search || '/'; } catch { return url; } };

export default function FrictionPage() {
  const { rangeQs } = useFilters();
  const [sort, setSort] = useState('any');
  const [minSessions, setMinSessions] = useState(5);
  const { data, error, loading, reload } = useApiData<Friction>(`/dashboard/friction?${rangeQs}&sort=${sort}&minSessions=${minSessions}`);

  return (
    <AnalyticsPage>
      <PageHead title="Friction" more="Friction means visitors had trouble. The four signals are quick backs, dead clicks, rage clicks and script errors (explained under the table). Lower is better. Use the table to find which pages to fix first, then log the problem as a finding.">Where visitors hit trouble: quick backs, dead clicks, rage clicks and script errors. Human sessions only.</PageHead>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton variant="table" />}
      {data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          {data.tiles.length > 0 && <div className="tiles">{data.tiles.map((t) => <Tile key={t.key} tile={t} spark={sparkFor(t.key, data.series)} color="var(--s2)" />)}</div>}
          <TrendChart title="Share of sessions with friction, per day" unit="percent" points={data.series} markers={data.annotations} hint="Each line is one problem type, as a share of that day’s visits. A line going up means more visitors are struggling." note="Lower is better. Each line is the share of that day's human sessions."
            series={[
              { key: 'quickback', label: 'Quick backs', color: 'var(--s1)' }, { key: 'dead', label: 'Dead clicks', color: 'var(--s2)' },
              { key: 'rage', label: 'Rage clicks', color: 'var(--s3)' }, { key: 'scriptError', label: 'Script errors', color: 'var(--s4)' },
            ]} />

          <h2>Pages with the most friction</h2>
          <div className="row">
            <label style={{ margin: 0 }}>Rank by{' '}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            </label>
            <label style={{ margin: 0 }}>Minimum sessions{' '}
              <input type="number" min={1} max={1000} style={{ width: 80 }} value={minSessions} onChange={(e) => setMinSessions(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          <Hint>Pages ranked by how many visits had the problem. Pages with very few visits are hidden because their rates swing wildly.</Hint>
          {data.coverage.pageDays === 0 && <div className="notice">No page-level data stored yet. It is saved by the nightly run.</div>}
          {data.pages.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Page</th><th className="num">Sessions</th><th className="num">Quick backs</th><th className="num">Dead clicks</th><th className="num">Rage clicks</th><th className="num">Script errors</th><th className="num">Scroll</th><th>Recordings</th><th>Findings</th></tr></thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.url}>
                      <td style={{ wordBreak: 'break-all', minWidth: 180 }}><a href={p.url} target="_blank" rel="noreferrer">{path(p.url)}</a></td>
                      <td className="num">{p.sessions}</td><td className="num">{cell(p.quickback)}</td><td className="num">{cell(p.dead)}</td><td className="num">{cell(p.rage)}</td><td className="num">{cell(p.scriptError)}</td>
                      <td className="num">{formatValue(p.scrollDepth, 'percent')}</td>
                      <td><RecordingLink pageUrl={p.url} /></td>
                      <td><FindingLinks url={p.url} open={p.openFindings} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.pages.length > 0 && <Guide items={[G.sessions, G.quickBacks, G.deadClicks, G.rageClicks, G.scriptErrors, G.friction, G.scroll, G.recordings, G.findings]} />}
          {data.coverage.pageDays > 0 && data.pages.length === 0 && <div className="empty"><b>No pages reach {minSessions} sessions</b>Lower the minimum or choose a longer range.</div>}
          {data.coverage.pageDays > 0 && (
            <p className="muted">
              {data.notes.sessionNote} {data.notes.excludedLocalRows > 0 && `Rows from local or test addresses are left out (${data.notes.excludedLocalRows}). `}
              {data.notes.truncatedDays > 0 && `On ${data.notes.truncatedDays} day(s) Clarity hit its 1,000-row limit, so rare pages may be missing.`}
            </p>
          )}
        </div>
      )}
    </AnalyticsPage>
  );
}
