import { Connection } from 'mongoose';
import { HealthController } from './health.controller';

const make = (readyState: number, runs: unknown[] = [], enabled = { clarity: true, ga4: false }, contact: string | undefined = undefined) => {
  const model = { find: () => ({ sort: () => ({ limit: async () => runs }) }) };
  return new HealthController(
    { readyState } as unknown as Connection,
    model as never,
    { enabled: enabled.clarity } as never,
    { enabled: enabled.ga4 } as never,
    { enabled: async () => false } as never,
    { get: () => contact } as never,
    { siteName: () => 'Enosis Outsourcing' } as never,
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

  it('gives the sign-in page only the last update time and the access contact', async () => {
    const at = new Date('2026-11-19T03:20:00Z');
    const r = await make(1, [{ status: 'success', startedAt: at }], undefined, ' it@example.com ').context();
    expect(r).toEqual({ dataUpdatedAt: at.toISOString(), accessContact: 'it@example.com', siteName: 'Enosis Outsourcing' });
  });

  it('reports no update time and no contact when nothing is known', async () => {
    expect(await make(1, []).context()).toEqual({ dataUpdatedAt: null, accessContact: null, siteName: 'Enosis Outsourcing' });
  });
});
