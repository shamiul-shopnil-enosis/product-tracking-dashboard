/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes mimic untyped Mongoose and Google client objects */
import { ConfigService } from '@nestjs/config';
import { Ga4Client } from './ga4.client';
import { Ga4SyncService } from './ga4-sync.service';

// A query that can be awaited directly or chained with .sort(), like a Mongoose query.
const query = (v: unknown) => Object.assign(Promise.resolve(v), { sort: () => Promise.resolve(v) });

function setup(opts: { propertyId?: string; keyFile?: string; runner: (req: any) => unknown }) {
  const config = { get: (k: string, d?: string) => ({ GA4_PROPERTY_ID: opts.propertyId ?? '123456', GA4_KEY_FILE: opts.keyFile ?? __filename }[k] ?? d) } as unknown as ConfigService;
  const client = new Ga4Client(config);
  client.useRunner({ runReport: async (req) => [opts.runner(req)] });
  const stored: any[] = [];
  const runDoc: any = { results: [], callsUsed: 0, save: jest.fn().mockResolvedValue(undefined) };
  const runs = { findOne: jest.fn(() => query(null)), create: jest.fn(async (d: object) => Object.assign(runDoc, d)) };
  const snapshots = { updateOne: jest.fn(async (filter: object, update: any) => stored.push({ filter, ...update.$set })), exists: jest.fn(async () => null), distinct: jest.fn(async () => []) };
  const svc = new Ga4SyncService(client, config, snapshots as never, runs as never);
  return { svc, stored, runDoc, runs };
}

const report = (dims: string[], mets: string[], rows: Array<[string[], string[]]>) => ({
  dimensionHeaders: dims.map((name) => ({ name })),
  metricHeaders: mets.map((name) => ({ name })),
  rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((value) => ({ value })) })),
});

const healthy = (req: any) => {
  const metrics: string[] = req.metrics.map((m: any) => m.name);
  const dims: string[] = req.dimensions.map((d: any) => d.name);
  if (metrics[0] === 'keyEvents' && dims.includes('eventName')) return report(dims, metrics, [[['20260101', 'sign_up'], ['3']], [['20260101', 'page_view'], ['0']]]);
  if (metrics[0] === 'keyEvents') return report(dims, metrics, [[['20260101'], ['4']], [['20260102'], ['6']]]);
  if (dims.includes('landingPage')) return report(dims, metrics, [[['20260101', '/'], ['10', '5']], [['20260102', '/'], ['12', '6']]]);
  if (dims.includes('sessionDefaultChannelGroup')) return report(dims, metrics, [[['20260101', 'Direct'], ['10', '5', '8']]]);
  return report(dims, metrics, [[['20260101'], ['100', '80', '20', '60', '200', '500', '4000']], [['20260102'], ['120', '90', '25', '70', '240', '600', '4800']]]);
};

describe('Ga4SyncService.run', () => {
  it('stores one snapshot per day and breakdown, with key events merged in', async () => {
    const { svc, stored, runDoc } = setup({ runner: healthy });
    await svc.run('manual', 3);
    const none = stored.filter((s) => s.filter.breakdown === 'none');
    expect(none.map((s) => s.filter.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(none[0].payload[0]).toMatchObject({ sessions: 100, activeUsers: 80, keyEvents: 4 });
    expect(stored.filter((s) => s.filter.breakdown === 'channel')).toHaveLength(1);
    expect(stored.filter((s) => s.filter.breakdown === 'landing')).toHaveLength(2);
    expect(stored.every((s) => s.filter.provider === 'ga4' && s.filter.window === 'day')).toBe(true);
    expect(runDoc.status).toBe('success');
    expect(stored.filter((s) => s.filter.breakdown === 'event')).toHaveLength(1);
    expect(stored.find((s) => s.filter.breakdown === 'event')!.payload).toEqual([{ eventName: 'sign_up', keyEvents: 3 }]); // zero rows dropped
    expect(runDoc.callsUsed).toBe(5); // totals, key events, channel, landing, events by name
  });

  it('asks GA4 for the right range and property', async () => {
    const seen: any[] = [];
    const { svc } = setup({ runner: (req) => { seen.push(req); return healthy(req); } });
    await svc.run('manual', 30);
    expect(seen[0].property).toBe('properties/123456');
    expect(seen[0].dateRanges).toEqual([{ startDate: '30daysAgo', endDate: 'yesterday' }]);
    expect(seen[0].dimensions).toEqual([{ name: 'date' }]);
  });

  it('carries on without key events when GA4 rejects that metric', async () => {
    const { svc, stored, runDoc } = setup({ runner: (req) => { if (req.metrics[0].name === 'keyEvents' && req.dimensions.length === 1) throw { code: 3 }; return healthy(req); } });
    await svc.run('manual', 3);
    const none = stored.filter((s) => s.filter.breakdown === 'none');
    expect(none[0].payload[0]).not.toHaveProperty('keyEvents');
    expect(runDoc.status).toBe('success');
  });

  it('stops at the first access error and records why', async () => {
    const { svc, stored, runDoc } = setup({ runner: () => { throw { code: 7 }; } });
    await svc.run('manual', 3);
    expect(stored).toHaveLength(0);
    expect(runDoc.status).toBe('failed');
    expect(runDoc.error).toMatch(/refused the service account/);
    expect(runDoc.results).toHaveLength(1); // did not try the other reports
  });

  it('refuses to run when GA4 is not set up', async () => {
    const { svc } = setup({ propertyId: '', runner: healthy });
    await expect(svc.run('manual', 3)).rejects.toThrow(/GA4_PROPERTY_ID/);
    const missing = setup({ keyFile: '/nonexistent/ga4.json', runner: healthy });
    await expect(missing.svc.run('manual', 3)).rejects.toThrow(/Key file not found/);
  });

  it('flags the most recent days as approximate', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const { svc, stored } = setup({ runner: (req) => (req.dimensions.length === 1 && req.metrics[0].name !== 'keyEvents' ? report(['date'], ['sessions'], [[[yesterday], ['5']]]) : report(req.dimensions.map((d: any) => d.name), req.metrics.map((m: any) => m.name), [])) });
    await svc.run('manual', 3);
    const none = stored.find((s) => s.filter.breakdown === 'none');
    expect(none.filter.date < today).toBe(true);
    expect(none.approximate).toBe(true);
  });
});
