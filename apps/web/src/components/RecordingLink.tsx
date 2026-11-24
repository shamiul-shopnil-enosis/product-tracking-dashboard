'use client';

import { Icon } from './Icon';
import { useAuth } from './AuthProvider';
import { CLARITY_MAX_DAYS, daysBackTo, recordingsUrl, useClarityProject } from '@/lib/clarity';
import { useFilters } from '@/lib/filters';

/**
 * Opens the recordings of this page in Clarity: the project's Recordings, filtered to visits of exactly this page,
 * going back as far as the dates chosen at the top (Clarity keeps 30 days of recordings).
 */
export function RecordingLink({ pageUrl }: { pageUrl: string }) {
  const project = useClarityProject();
  const { user } = useAuth();
  const { range } = useFilters();

  if (project === undefined) return <span className="muted">…</span>;
  if (!project) {
    return <span className="muted" title={user?.role === 'admin' ? 'Set the Clarity project ID under Data sources, Connections' : 'An admin has not set the Clarity project yet'}>–</span>;
  }

  const back = daysBackTo(range.from);
  const days = Math.min(CLARITY_MAX_DAYS, back);
  return (
    <a className="rec" href={recordingsUrl(project, pageUrl, back)} target="_blank" rel="noopener noreferrer"
      aria-label={`Open recordings of ${pageUrl} in Clarity, last ${days} days`}
      title={`Opens Clarity recordings of exactly this page, last ${days} days${back > CLARITY_MAX_DAYS ? ' (Clarity keeps 30 days)' : ''}`}>
      Open <Icon name="external" size={13} />
    </a>
  );
}
