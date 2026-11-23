'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { rangeQuery, resolveRange } from './range';

export const THRESHOLDS = [10, 20, 30, 50] as const;
export type Traffic = 'human' | 'all';

// An empty value means "not set": the key is left out of the address.
const DEFAULTS = { days: '14', traffic: 'human', compare: '1', threshold: '20', from: '', to: '', cmp: 'prev', cmpFrom: '', cmpTo: '' } as const;
export type FilterKey = keyof typeof DEFAULTS;
export const FILTER_KEYS = Object.keys(DEFAULTS) as FilterKey[];

/** Date range, comparison, traffic and alert threshold. They live in the address, so a view can be shared and survives navigation. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const range = useMemo(
    () => resolveRange({ days: sp.get('days'), from: sp.get('from'), to: sp.get('to'), compare: sp.get('compare'), cmp: sp.get('cmp'), cmpFrom: sp.get('cmpFrom'), cmpTo: sp.get('cmpTo') }),
    [sp],
  );
  const traffic: Traffic = sp.get('traffic') === 'all' ? 'all' : 'human';
  const threshold = (THRESHOLDS as readonly number[]).includes(Number(sp.get('threshold'))) ? Number(sp.get('threshold')) : 20;

  const set = useCallback(
    (patch: Partial<Record<FilterKey, string>>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === DEFAULTS[k as FilterKey]) p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  return {
    /** The chosen dates, with the comparison period worked out */
    range,
    /** How many days are in the range */
    days: range.days,
    compare: range.compare,
    /** What to add to a data request so the server uses the same dates, for example "days=14" */
    rangeQs: rangeQuery(range),
    traffic, threshold, set,
  };
}

/** The filter part of the current address, to carry from page to page. */
export function filterQuery(sp: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v !== null) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}
