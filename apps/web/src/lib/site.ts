'use client';

import { useApiData } from './useApi';

/** The name of the site this dashboard is about. An admin sets it under Data sources. */
export function useSiteName(): string {
  const { data } = useApiData<{ siteName?: string }>('/health/context');
  return data?.siteName ?? 'Enosis Outsourcing';
}
