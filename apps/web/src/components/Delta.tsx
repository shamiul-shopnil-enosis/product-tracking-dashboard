import type { Trend } from '@/lib/dashboard';
import { bandOf } from '@/lib/change';

const MAP = {
  better: { icon: '▲', word: 'better' },
  worse: { icon: '▼', word: 'worse' },
  flat: { icon: '■', word: 'about the same' },
  unknown: { icon: '–', word: 'no earlier period' },
} as const;

/** A change with an arrow and words, never colour alone. */
export function Delta({ change, trend, wordless }: { change: number | null; trend: Trend; wordless?: boolean }) {
  // A neutral metric (no good or bad direction) that moved a lot is "changed", not "about the same"
  const moved = trend === 'flat' && change !== null && Math.abs(change) >= 2;
  const m = moved ? { icon: change! > 0 ? '▲' : '▼', word: 'changed' } : MAP[trend];
  const sign = change === null ? '' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toFixed(Math.abs(change) < 10 && change % 1 ? 1 : 0)}%`;
  return (
    <span className={`delta ${trend} band-${bandOf(change, trend)}`}>
      <i aria-hidden="true">{m.icon}</i>
      {sign}
      {!wordless && <em>{m.word}</em>}
    </span>
  );
}
