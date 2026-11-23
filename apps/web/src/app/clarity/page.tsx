'use client';

import { AnalyticsPage } from '@/components/FilterBar';
import { ErrorState } from '@/components/ErrorState';
import { HubLinks } from '@/components/HubLinks';
import { PageHead } from '@/components/PageHead';
import { PageSkeleton } from '@/components/Skeleton';
import { Tile } from '@/components/Tile';
import { Tip } from '@/components/Tip';
import { TrendChart } from '@/components/TrendChart';
import { formatValue, type Overview } from '@/lib/dashboard';
import { useFilters } from '@/lib/filters';
import { sparkFor } from '@/lib/series';
import { useApiData } from '@/lib/useApi';

const GROUP_HINTS: Record<string, string> = {
  Audience: 'How many people visit. Each card is a per-day average, with the change against the comparison period.',
  Engagement: 'What visitors do once they arrive: how many pages they view, how far they scroll and how long they stay. Higher is usually better.',
  Friction: 'Signs that visitors struggled. Each number is the share of visits affected. Lower is better, so a down arrow is good news.',
};
const GROUPS = ['Audience', 'Engagement', 'Friction'] as const;

export default function ClarityPage() {
  const f = useFilters();
  const { data, error, reload } = useApiData<Overview>(`/dashboard/overview?${f.rangeQs}&traffic=${f.traffic}&threshold=${f.threshold}`);
  return (
    <AnalyticsPage quiet show={{ traffic: true, compare: true }}>
      <PageHead title="Clarity">Everything from Microsoft Clarity: how real visitors behave on the site. Press + on a card to put it on your Overview.</PageHead>
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {!data && !error && <PageSkeleton />}
      {data && (
        <>
          {GROUPS.filter((g) => data.tiles.some((t) => t.source === 'clarity' && t.group === g)).map((g) => (
            <section key={g}>
              <h2 className="eyebrow">{g} <Tip label={g}>{GROUP_HINTS[g]}</Tip></h2>
              <div className="tiles">
                {data.tiles.filter((t) => t.source === 'clarity' && t.group === g).map((t) => (
                  <Tile key={t.key} tile={t} spark={sparkFor(t.key, data.series, f.traffic)} />
                ))}
              </div>
              {g === 'Friction' && (
                <TrendChart
                  compactHint title="Share of sessions with friction"
                  hint="Each line is the share of that day’s visits where visitors hit that problem. Lower is better."
                  unit="percent" points={data.series} markers={data.annotations}
                  series={[
                    { key: 'quickback', label: 'Quick backs', color: 'var(--s1)' }, { key: 'dead', label: 'Dead clicks', color: 'var(--s2)' },
                    { key: 'rage', label: 'Rage clicks', color: 'var(--s3)' }, { key: 'scriptError', label: 'Script errors', color: 'var(--s4)' },
                  ]}
                />
              )}
            </section>
          ))}
          {data.tiles.every((t) => t.source !== 'clarity') && <div className="empty"><b>No Clarity numbers in this range</b>Pick a range with stored days, or check Data sources.</div>}
          {data.sourceComparison && (
            <section className="card flush" aria-label="GA4 and Clarity" style={{ marginTop: 16 }}>
              <h2>GA4 and Clarity <Tip label="GA4 and Clarity">GA4 only removes bots it recognises; Clarity also spots bots from page behaviour. Use Clarity for how people behave and GA4 for where visits start and what they achieve.</Tip></h2>
              <div className="kv" style={{ marginTop: 8 }}>
                <span>GA4 sessions per day</span><span className="num">{formatValue(data.sourceComparison.ga4SessionsPerDay, 'count')}</span>
                <span>Clarity human</span><span className="num">{formatValue(data.sourceComparison.clarityHumanSessionsPerDay, 'count')}</span>
                <span>Clarity human and bot</span><span className="num">{formatValue(data.sourceComparison.clarityAllSessionsPerDay, 'count')}</span>
              </div>
            </section>
          )}
          <h2 className="eyebrow">Go deeper</h2>
          <HubLinks links={[{ href: '/friction', label: 'Friction', text: 'Which pages frustrate visitors, with rage clicks, dead clicks and quick backs', icon: 'friction' }]} />
        </>
      )}
    </AnalyticsPage>
  );
}
