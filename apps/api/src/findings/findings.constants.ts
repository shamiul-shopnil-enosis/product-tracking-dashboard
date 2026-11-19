export const FINDING_TYPES = ['usability', 'functional', 'content', 'visual', 'performance', 'accessibility'] as const;
export const REACHES = ['few', 'some', 'most'] as const;
export const EFFORTS = ['S', 'M', 'L'] as const;
export const STATUSES = ['new', 'planned', 'shipped', 'ignored'] as const;
export const BANDS = ['next_release', 'next_planned_release', 'planned'] as const;

export type FindingType = (typeof FINDING_TYPES)[number];
export type Reach = (typeof REACHES)[number];
export type Effort = (typeof EFFORTS)[number];
export type Status = (typeof STATUSES)[number];
export type Band = (typeof BANDS)[number];

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
