import type { Trend } from './dashboard';

/** How a change is coloured. The colour shows how big the move is, not which tool it came from. */
export type Band = 'flat' | 'good' | 'good-strong' | 'warn' | 'bad';

/** Under 5% either way is grey. Better by 5% to 20% is green, by more than 20% dark green. Worse by 5% to 20% is orange, by more than 20% red. */
export function bandOf(change: number | null, trend: Trend): Band {
  if (change === null || trend === 'unknown') return 'flat';
  const size = Math.abs(change);
  if (size < 5) return 'flat';
  if (trend === 'better') return size >= 20 ? 'good-strong' : 'good';
  if (trend === 'worse') return size >= 20 ? 'bad' : 'warn';
  return 'flat'; // a metric with no good or bad direction
}

export const BAND_COLOR: Record<Band, string> = {
  flat: 'var(--border)', good: 'var(--good)', 'good-strong': 'var(--good-strong)', warn: 'var(--orange)', bad: 'var(--bad)',
};

export const SOURCE_LABEL = { clarity: 'Clarity', ga4: 'GA4' } as const;
