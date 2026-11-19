export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export interface RunLike {
  status: string;
  startedAt: Date;
  error?: string | null;
}

export interface ProviderHealth {
  provider: string;
  lastSuccessAt: Date | null;
  lastRunStatus: string | null;
  lastError: string | null;
  /** No successful run for longer than a night and a half */
  stale: boolean;
  ok: boolean;
}

/**
 * `runs` newest first. A provider is healthy when it has succeeded (fully or partly) within 36 hours,
 * which tolerates one missed night but not two.
 */
export function providerHealth(provider: string, runs: RunLike[], now: Date, staleAfterMs = STALE_AFTER_MS): ProviderHealth {
  const finished = runs.filter((r) => r.status !== 'running');
  const lastSuccess = finished.find((r) => r.status === 'success' || r.status === 'partial');
  const last = finished[0];
  const lastSuccessAt = lastSuccess?.startedAt ?? null;
  const stale = !lastSuccessAt || now.getTime() - lastSuccessAt.getTime() > staleAfterMs;
  return {
    provider,
    lastSuccessAt,
    lastRunStatus: last?.status ?? null,
    lastError: last && last.status !== 'success' ? last.error ?? null : null,
    stale,
    ok: !stale,
  };
}
