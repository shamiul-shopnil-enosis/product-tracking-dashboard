'use client';

import { useAuth } from '@/components/AuthProvider';

/** The name of the site the person is looking at: the active profile's name. */
export function useSiteName(): string {
  const { user } = useAuth();
  const active = user?.profiles?.find((p) => p.id === user.activeProfileId);
  return active?.name ?? 'Enosis Outsourcing';
}
