import { Band, Effort, Reach } from './findings.constants';

const REACH_WEIGHT: Record<Reach, number> = { few: 1, some: 2, most: 3 };
const EFFORT_FACTOR: Record<Effort, number> = { S: 1.2, M: 1.0, L: 0.8 };
export const BAND_RANK: Record<Band, number> = { next_release: 3, next_planned_release: 2, planned: 1 };

export interface Priority {
  score: number;
  band: Band;
}

/**
 * Score = severity (1-4) x reach weight (few 1, some 2, most 3) x effort factor (S 1.2, M 1.0, L 0.8).
 * Bands follow the plan (section 11.3):
 *  - severity 4 with some or most reach -> next release
 *  - severity 3 with most reach -> next planned release
 *  - everything else -> planned, ordered by score
 */
export function computePriority(severity: number, reach: Reach, effort: Effort): Priority {
  const score = Math.round(severity * REACH_WEIGHT[reach] * EFFORT_FACTOR[effort] * 10) / 10;
  let band: Band = 'planned';
  if (severity === 4 && (reach === 'some' || reach === 'most')) band = 'next_release';
  else if (severity === 3 && reach === 'most') band = 'next_planned_release';
  return { score, band };
}
