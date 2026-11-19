import { providerHealth } from './sync-health';

const H = 60 * 60 * 1000;
const now = new Date('2026-11-18T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * H);

describe('providerHealth', () => {
  it('is healthy after a recent success', () => {
    const h = providerHealth('clarity', [{ status: 'success', startedAt: ago(10) }], now);
    expect(h).toMatchObject({ ok: true, stale: false, lastRunStatus: 'success', lastError: null });
  });

  it('counts a partial run as a success', () => {
    expect(providerHealth('ga4', [{ status: 'partial', startedAt: ago(5) }], now).ok).toBe(true);
  });

  it('is stale when the last success is older than 36 hours, and reports the newer failure', () => {
    const h = providerHealth('ga4', [
      { status: 'failed', startedAt: ago(2), error: 'auth' },
      { status: 'success', startedAt: ago(40) },
    ], now);
    expect(h).toMatchObject({ ok: false, stale: true, lastRunStatus: 'failed', lastError: 'auth' });
  });

  it('survives one failed night after a success', () => {
    const h = providerHealth('clarity', [
      { status: 'failed', startedAt: ago(2) },
      { status: 'success', startedAt: ago(26) },
    ], now);
    expect(h.ok).toBe(true);
  });

  it('ignores a run still in progress', () => {
    const h = providerHealth('clarity', [{ status: 'running', startedAt: ago(0.1) }, { status: 'success', startedAt: ago(3) }], now);
    expect(h.lastRunStatus).toBe('success');
  });

  it('is stale with no runs at all', () => {
    expect(providerHealth('ga4', [], now)).toMatchObject({ ok: false, lastSuccessAt: null, lastRunStatus: null });
  });
});
