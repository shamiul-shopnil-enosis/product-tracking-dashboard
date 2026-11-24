'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { rangeQuery, resolveRange } from './range';
import { useToast } from '@/components/Toast';

export const THRESHOLDS = [10, 20, 30, 50] as const;
export type Traffic = 'human' | 'all';

// An empty value means "not set": the key is left out of the address.
const DEFAULTS = { days: '14', traffic: 'human', compare: '1', threshold: '20', from: '', to: '', cmp: 'prev', cmpFrom: '', cmpTo: '' } as const;
export type FilterKey = keyof typeof DEFAULTS;
export const FILTER_KEYS = Object.keys(DEFAULTS) as FilterKey[];

const STORE = 'pt.filters.v1';
const readStore = (): string => { try { return localStorage.getItem(STORE) ?? ''; } catch { return ''; } };
const writeStore = (qs: string) => { try { if (qs) localStorage.setItem(STORE, qs); else localStorage.removeItem(STORE); } catch { /* private window: it just is not remembered */ } };
/** Only the filter parts of an address. */
const filterPart = (p: URLSearchParams) => { const o = new URLSearchParams(); for (const k of FILTER_KEYS) { const v = p.get(k); if (v !== null) o.set(k, v); } return o.toString(); };
// Opening the dashboard with no dates in the address returns to the last dates the person used, once per page load.
let restored = false;

/** Date range, comparison, traffic and alert threshold. They live in the address, so a view can be shared and survives navigation. The last choice is remembered on this device. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  useEffect(() => {
    if (restored) return;
    restored = true;
    if (filterPart(sp) !== '') return; // the address already says what to show
    const saved = readStore();
    if (!saved) return;
    const p = new URLSearchParams(sp.toString());
    new URLSearchParams(saved).forEach((v, k) => p.set(k, v));
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    toast('Showing the dates you used last time', { tone: 'info', action: { label: 'Use the default', onClick: () => { writeStore(''); router.replace(pathname, { scroll: false }); } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      writeStore(filterPart(p));
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
