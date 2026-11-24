'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnalyticsPage } from '@/components/FilterBar';
import { CoverageNotice } from '@/components/CoverageNotice';
import { ErrorState } from '@/components/ErrorState';
import { Guide, Hint } from '@/components/Hint';
import { PageSkeleton } from '@/components/Skeleton';
import { VisitorGlobe } from '@/components/VisitorGlobe';
import { Tip } from '@/components/Tip';
import { TrendChart } from '@/components/TrendChart';
import { formatChange, formatValue, type DemographicsResponse } from '@/lib/dashboard';
import { G } from '@/lib/glossary';
import { useFilters } from '@/lib/filters';
import { useApiData } from '@/lib/useApi';

const DIMENSIONS = [
  { value: 'country', label: 'Country' }, { value: 'city', label: 'City' }, { value: 'device', label: 'Device' },
  { value: 'browser', label: 'Browser' }, { value: 'language', label: 'Language' },
];
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

export default function AudiencePage() {
  const { rangeQs } = useFilters();
  const [dimension, setDimension] = useState('country');
  const [organic, setOrganic] = useState(false);
  const { data, error, loading, reload } = useApiData<DemographicsResponse>(`/dashboard/ga4-demographics?dimension=${dimension}&${rangeQs}&organic=${organic ? 1 : 0}`);
  const max = data ? Math.max(1, ...data.rows.map((r) => r.share ?? 0)) : 1;
  const label = DIMENSIONS.find((d) => d.value === dimension)!.label;

  return (
    <AnalyticsPage>
      <div className="page-head">
        <h1>Audience <Tip label="Audience">Who the visitors are: where they are, what device and browser they use, and what language. From Google Analytics, so it includes bots GA4 does not recognise. A row with a very low engagement rate is probably automated traffic, not people. Age and gender are not shown because GA4 only provides them when Google Signals is on.</Tip></h1>
        <p>Where visitors are from and what they use. Google Analytics.</p>
      </div>
      <div className="row" role="group" aria-label="Visitors" style={{ marginBottom: 8 }}>
        <span className="muted">Visitors</span>
        <div className="seg">
          <button aria-pressed={!organic} onClick={() => setOrganic(false)}>All visitors</button>
          <button aria-pressed={organic} onClick={() => setOrganic(true)}>Organic search only</button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Break down by">
        {DIMENSIONS.map((d) => (
          <button key={d.value} role="tab" aria-selected={d.value === dimension} className={d.value === dimension ? 'primary' : undefined} onClick={() => setDimension(d.value)}>{d.label}</button>
        ))}
      </div>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton variant="table" />}
      {data && !data.connected && (
        <div className="notice">No audience data stored yet. GA4 reads it after the next sync, and an admin can start one under <Link href="/admin/data">Data sources</Link>.</div>
      )}
      {data && data.connected && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          {dimension === 'country' && <VisitorGlobe qs={rangeQs} size={320} title="Visitors around the world" />}
          <CoverageNotice current={data.coverage.current} previous={data.coverage.previous} />
          {data.chart.series.length > 0 && (
            <TrendChart compactHint title={`Sessions per day by ${label.toLowerCase()} (top ${data.chart.series.length})`} hint="One line per value: visits per day." unit="count"
              points={data.chart.points} markers={data.annotations} series={data.chart.series.map((s, i) => ({ key: s.id, label: s.label || '(not set)', color: COLORS[i] }))} />
          )}
          <h2>{label} <Tip label={label}>{organic ? 'Only visitors who arrived from a search engine.' : 'Every visitor Google Analytics counted.'} Biggest first. “(other)” adds up the small ones.</Tip></h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{label}</th><th className="num">Sessions</th><th>Share</th><th className="num">Per day vs before</th>
                  <th className="num">Engagement rate <Tip label="Engagement rate">Share of visits longer than 10 seconds, with 2+ pages, or with a key event. Low on a big row suggests automated visits.</Tip></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name || '(not set)'}</td>
                    <td className="num">{formatValue(r.sessions, 'count')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="bar" style={{ width: `${((r.share ?? 0) / max) * 80}px` }} aria-hidden />{formatValue(r.share, 'percent')}</td>
                    <td className="num">{formatChange(r.change)}</td>
                    <td className="num">{formatValue(r.engagementRate, 'percent')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Guide items={[G.sessions, G.share, G.change, G.engagement]} />
          <Hint>{data.notes.source}</Hint>
        </div>
      )}
    </AnalyticsPage>
  );
}
