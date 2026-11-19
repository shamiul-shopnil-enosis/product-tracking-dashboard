import { Connection } from 'mongoose';
import { HealthController } from './health.controller';

const make = (readyState: number, runs: unknown[] = [], enabled = { clarity: true, ga4: false }) => {
  const model = { find: () => ({ sort: () => ({ limit: async () => runs }) }) };
  return new HealthController(
    { readyState } as unknown as Connection,
    model as never,
    { enabled: enabled.clarity } as never,
    { enabled: enabled.ga4 } as never,
  );
};

describe('HealthController', () => {
  it('reports ok when the database is connected', () => {
    expect(make(1).check()).toEqual({ status: 'ok', db: 'up' });
  });

  it('reports degraded when the database is not connected', () => {
    expect(make(0).check()).toEqual({ status: 'degraded', db: 'down' });
  });

  it('flags a connected source with no recent success, and skips disabled ones', async () => {
    const r = await make(1, []).sync();
    expect(r.syncOk).toBe(false);
    expect(r.providers.map((p) => p.provider)).toEqual(['clarity']);
  });

  it('is fine when every connected source synced recently', async () => {
    const r = await make(1, [{ status: 'success', startedAt: new Date() }]).sync();
    expect(r.syncOk).toBe(true);
  });
});
