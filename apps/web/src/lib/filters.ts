'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const RANGES = [7, 14, 30] as const;
export const THRESHOLDS = [10, 20, 30, 50] as const;
export type Traffic = 'human' | 'all';

const DEFAULTS = { days: '14', traffic: 'human', compare: '1', threshold: '20' } as const;
export const FILTER_KEYS = Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>;

/** Range, traffic, compare and alert threshold. They live in the address, so a view can be shared and survives navigation. */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const days = (RANGES as readonly number[]).includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 14;
  const traffic: Traffic = sp.get('traffic') === 'all' ? 'all' : 'human';
  const compare = sp.get('compare') !== '0';
  const threshold = (THRESHOLDS as readonly number[]).includes(Number(sp.get('threshold'))) ? Number(sp.get('threshold')) : 20;

  const set = useCallback(
    (patch: Partial<Record<keyof typeof DEFAULTS, string>>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === DEFAULTS[k as keyof typeof DEFAULTS]) p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  return { days, traffic, compare, threshold, set };
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
