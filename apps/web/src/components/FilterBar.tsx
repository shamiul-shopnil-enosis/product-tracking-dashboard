'use client';

import { Tip } from './Tip';
import { RANGES, THRESHOLDS, useFilters } from '@/lib/filters';

type Show = { traffic?: boolean; compare?: boolean; threshold?: boolean };

function HelpText({ show }: { show?: Show }) {
  return (
    <>
      <b>Range</b> is how many recent full days are shown; the change figures compare it with the same number of days just before.
      {show?.traffic && <> <b>Human</b> leaves out bots (automated visits); <b>Human + bot</b> counts everything Clarity saw.</>}
      {show?.compare && <> <b>Compare</b> draws the previous period as a dashed line.</>}
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
      <div className="seg" role="group" aria-label="Range">
        {RANGES.map((d) => (
          <button key={d} aria-pressed={f.days === d} onClick={() => f.set({ days: String(d) })}>{d}d</button>
        ))}
      </div>
      {show.traffic && (
        <div className="seg" role="group" aria-label="Sessions">
          <button aria-pressed={f.traffic === 'human'} onClick={() => f.set({ traffic: 'human' })}>Human</button>
          <button aria-pressed={f.traffic === 'all'} onClick={() => f.set({ traffic: 'all' })}>Human + bot</button>
        </div>
      )}
      {show.compare && (
        <label>
          <input type="checkbox" checked={f.compare} onChange={(e) => f.set({ compare: e.target.checked ? '1' : '0' })} /> Compare with previous period
        </label>
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
