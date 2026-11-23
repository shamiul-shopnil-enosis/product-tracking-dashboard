'use client';

import { useState } from 'react';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { FindingLinks } from '@/components/FindingLinks';
import { Guide, Hint } from '@/components/Hint';
import { G } from '@/lib/glossary';
import { PageSkeleton } from '@/components/Skeleton';
import Link from 'next/link';
import { formatChange, formatValue, type LandingResponse, type PagesResponse } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { useApiData } from '@/lib/useApi';
import { PageHead } from '@/components/PageHead';

const SORTS = [
  { value: 'sessions', label: 'Most sessions' }, { value: 'scrollDepth', label: 'Highest scroll depth' },
  { value: 'activeTime', label: 'Longest active time' }, { value: 'quickbackRate', label: 'Most quick backs' },
];
const label = (url: string) => { try { const u = new URL(url); return u.host + (u.pathname === '/' ? '' : u.pathname); } catch { return url; } };

export default function PagesPage() {
  const { rangeQs } = useFilters();
  const [sort, setSort] = useState('sessions');
  const [minSessions, setMinSessions] = useState(5);
  const { data, error, loading, reload } = useApiData<PagesResponse>(`/dashboard/pages?${rangeQs}&sort=${sort}&minSessions=${minSessions}`);
  const landing = useApiData<LandingResponse>(`/dashboard/landing-pages?${rangeQs}&minSessions=${minSessions}`).data;

  return (
    <AnalyticsPage>
      <PageHead title="Pages" more="Each row is one page of the site. Use it to find pages that attract visitors but lose them (low scroll, short time, many quick backs), and pages that work well. “Rank by” changes the order; “Minimum sessions” hides pages with too few visits to judge. A session counts for every page it viewed.">How each page performs: how many visitors reach it, how far they scroll and how long they stay. Human sessions only.</PageHead>
      <div className="row">
        <label style={{ margin: 0 }}>Rank by{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </label>
        <label style={{ margin: 0 }}>Minimum sessions{' '}
          <input type="number" min={1} max={1000} style={{ width: 80 }} value={minSessions} onChange={(e) => setMinSessions(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </div>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          {data.pages.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Page</th><th className="num">Sessions</th><th className="num">Per day vs before</th><th className="num">Pages / session</th><th className="num">Scroll</th><th className="num">Active time</th><th className="num">Quick backs</th><th>Findings</th></tr></thead>
                <tbody>
                  {data.pages.map((p) => (
                    <tr key={p.url}>
                      <td style={{ wordBreak: 'break-all', minWidth: 200 }}><a href={p.url} target="_blank" rel="noreferrer">{label(p.url)}</a></td>
                      <td className="num">{formatValue(p.humanSessions, 'count')}</td>
                      <td className="num">{formatChange(p.change)}</td>
                      <td className="num">{formatValue(p.pagesPerSession, 'ratio')}</td>
                      <td className="num">{formatValue(p.scrollDepth, 'percent')}</td>
                      <td className="num">{formatValue(p.activeTime, 'seconds')}</td>
                      <td className="num">{formatValue(p.quickbackRate, 'percent')}</td>
                      <td><FindingLinks url={p.url} open={p.openFindings} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.pages.length > 0 && <Guide items={[{ term: 'Sessions', text: 'Visits that viewed this page at least once (Clarity cannot say which page a visit started on; see Landing pages below for that).' }, G.change, G.pagesPerSession, G.scroll, G.activeTime, G.quickBacks, G.findings]} />}
          {data.coverage.current.daysWithData > 0 && data.pages.length === 0 && <div className="empty"><b>No pages reach {minSessions} sessions</b>Lower the minimum or choose a longer range.</div>}
          {data.coverage.current.daysWithData > 0 && (
            <p className="muted">
              {data.notes.sessionNote} {data.notes.landingNote}{' '}
              {data.notes.excludedLocalRows > 0 && `Rows from local or test addresses are left out (${data.notes.excludedLocalRows}). `}
              {data.notes.truncatedDays > 0 && `On ${data.notes.truncatedDays} day(s) Clarity hit its 1,000-row limit, so rare pages may be missing.`}
            </p>
          )}
        </div>
      )}
      <h2>Landing pages (GA4)</h2>
      <Hint>A landing page is the first page a visitor sees. This shows where visits start, from Google Analytics, so it includes bots GA4 does not recognise.</Hint>
      {landing && !landing.connected && (
        <div className="notice">GA4 is not connected yet, or has no stored days. Landing pages, where visits start, come from GA4. An admin can connect it under <Link href="/admin/data">Data sources</Link>.</div>
      )}
      {landing && landing.connected && (
        <>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Landing page</th><th className="num">Sessions</th><th className="num">Share</th><th className="num">Per day vs before</th><th className="num">Engagement rate</th></tr></thead>
              <tbody>
                {landing.pages.map((p) => (
                  <tr key={p.page}>
                    <td style={{ wordBreak: 'break-all', minWidth: 180 }}>{p.page || '(not set)'}</td>
                    <td className="num">{formatValue(p.sessions, 'count')}</td>
                    <td className="num">{formatValue(p.share, 'percent')}</td>
                    <td className="num">{formatChange(p.change)}</td>
                    <td className="num">{formatValue(p.engagementRate, 'percent')}</td>
                  </tr>
                ))}
                {landing.pages.length === 0 && <tr><td colSpan={5} className="muted">No landing page reaches {minSessions} sessions in this range.</td></tr>}
              </tbody>
            </table>
          </div>
          <Guide items={[{ term: 'Sessions', text: 'Visits that started on this page.' }, G.share, G.change, G.engagement]} />
          <p className="muted">{landing.notes.source} Showing {landing.pages.length} of {landing.notes.totalPages} pages.</p>
        </>
      )}
    </AnalyticsPage>
  );
}
