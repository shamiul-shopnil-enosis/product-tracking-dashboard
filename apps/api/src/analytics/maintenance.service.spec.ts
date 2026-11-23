import { alertText, MaintenanceService } from './maintenance.service';

const svc = (runs: unknown[], clarity = true, ga4 = false, speed = false) => {
  const model = { find: () => ({ sort: () => ({ limit: async () => runs }) }) };
  return new MaintenanceService({ get: () => undefined } as never, { enabled: clarity } as never, { enabled: ga4 } as never, { enabled: async () => speed } as never, model as never);
};

describe('MaintenanceService', () => {
  it('finds no problem when connected sources synced recently', async () => {
    expect(await svc([{ status: 'success', startedAt: new Date() }]).problems()).toEqual([]);
  });

  it('reports a connected source that has not succeeded', async () => {
    const p = await svc([{ status: 'failed', startedAt: new Date(), error: 'token rejected' }]).problems();
    expect(p).toHaveLength(1);
    expect(alertText(p)).toContain('clarity: never succeeded, last error: token rejected');
  });

  it('ignores sources that are turned off', async () => {
    expect(await svc([], false, false).problems()).toEqual([]);
  });
});
