'use client';

import { Tip } from './Tip';
import { THRESHOLDS, useFilters } from '@/lib/filters';
import { DateRangePicker } from './DateRangePicker';

type Show = { traffic?: boolean; compare?: boolean; threshold?: boolean };

function HelpText({ show }: { show?: Show }) {
  return (
    <>
      <b>The date picker</b> sets the days shown and, with <b>Compare</b> on, what they are compared with: the period just before, the same dates last year, or any dates you choose. Every change figure uses that comparison.
      {show?.traffic && <> <b>Human</b> leaves out bots (automated visits); <b>Human + bot</b> counts everything Clarity saw.</>}
      {show?.threshold && <> <b>Flag changes</b> sets how big a move must be to appear under “Needs attention”.</>}
      {' '}Today is not included because it is not finished.
    </>
  );
}

/** Range, traffic and the other filters, always in the same place at the top. */
export function FilterBar({ show = {}, quiet = false }: { show?: Show; quiet?: boolean }) {
  const f = useFilters();
  return (
    <div className="filterbar" role="group" aria-label="Filters">
      {show.traffic && (
        <div className="seg" role="group" aria-label="Sessions">
          <button aria-pressed={f.traffic === 'human'} onClick={() => f.set({ traffic: 'human' })}>Human</button>
          <button aria-pressed={f.traffic === 'all'} onClick={() => f.set({ traffic: 'all' })}>Human + bot</button>
        </div>
      )}
      {show.threshold && (
        <label>
          Flag changes of
          <select value={f.threshold} onChange={(e) => f.set({ threshold: e.target.value })}>
            {THRESHOLDS.map((t) => <option key={t} value={t}>{t}% or more</option>)}
          </select>
        </label>
      )}
      <Tip label="the filters" side="left" wide><HelpText show={show} /></Tip>
      <DateRangePicker />
    </div>
  );
}

/** The filter bar and a padded page body, for the analytics pages. */
export function AnalyticsPage({ show, quiet = false, children }: { show?: Show; /** Filter help as a tooltip instead of a paragraph */ quiet?: boolean; children: React.ReactNode }) {
  return (
    <>
      <FilterBar show={show} quiet={quiet} />
      <div className="page">{children}</div>
    </>
  );
}
