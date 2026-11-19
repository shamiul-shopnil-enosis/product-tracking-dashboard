export const TYPES = ['usability', 'functional', 'content', 'visual', 'performance', 'accessibility'] as const;
export const REACHES = ['few', 'some', 'most'] as const;
export const EFFORTS = ['S', 'M', 'L'] as const;
export const STATUSES = ['new', 'planned', 'shipped', 'ignored'] as const;
export const BANDS = ['next_release', 'next_planned_release', 'planned'] as const;
export const SEVERITIES = [1, 2, 3, 4] as const;

export type Band = (typeof BANDS)[number];

export const BAND_LABEL: Record<Band, string> = {
  next_release: 'Next release',
  next_planned_release: 'Next planned release',
  planned: 'Planned by score',
};

export const SEVERITY_LABEL: Record<number, string> = {
  1: '1 – cosmetic',
  2: '2 – annoying',
  3: '3 – blocks a task for some',
  4: '4 – blocks a core task',
};

export type Evidence = { label: string; url: string };
export type Attachment = { id: string; filename: string; mime: string; size: number };

export type Finding = {
  id: string;
  ref: number;
  title: string;
  type: string;
  where: string;
  description: string;
  whyItMatters: string;
  severity: number;
  reach: string;
  effort: string;
  suggestedChange: string;
  surface: string;
  firstMetric: string;
  status: string;
  plannedRelease: string;
  ignoredReason: string;
  githubUrl: string;
  pageUrl: string;
  evidenceLinks: Evidence[];
  attachments: Attachment[];
  resultCheck: { date?: string; before: string; after: string } | null;
  priority: {
    computedScore: number;
    computedBand: Band;
    overrideScore: number | null;
    overrideBand: Band | null;
    overrideReason: string;
    score: number;
    band: Band;
  };
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type FindingList = { items: Finding[]; total: number; page: number; limit: number };

const REACH_WEIGHT: Record<string, number> = { few: 1, some: 2, most: 3 };
const EFFORT_FACTOR: Record<string, number> = { S: 1.2, M: 1.0, L: 0.8 };

/** Mirrors the api's computePriority so the form can preview it. The api is the source of truth. */
export function previewPriority(severity: number, reach: string, effort: string): { score: number; band: Band } {
  const score = Math.round(severity * REACH_WEIGHT[reach] * EFFORT_FACTOR[effort] * 10) / 10;
  let band: Band = 'planned';
  if (severity === 4 && (reach === 'some' || reach === 'most')) band = 'next_release';
  else if (severity === 3 && reach === 'most') band = 'next_planned_release';
  return { score, band };
}
