import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { PsiError } from './psi.client';
import { MAX_MANUAL_RESULTS_PER_DAY, MAX_TARGETS, SpeedService } from './speed.service';

const goodResponse = {
  loadingExperience: { id: 'u', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 3 } } },
  lighthouseResult: {
    categories: { performance: { score: 0.91, auditRefs: [{ id: 'unused-javascript', group: 'diagnostics' }] } },
    audits: { 'first-contentful-paint': { numericValue: 1000 }, 'unused-javascript': { title: 'Reduce unused JavaScript', score: 0.4, scoreDisplayMode: 'numeric', details: { type: 'opportunity', overallSavingsMs: 300, items: [] } } },
  },
};

const chain = (value: unknown) => {
  const c: Record<string, jest.Mock> = {};
  c.sort = jest.fn(() => c);
  c.lean = jest.fn(async () => value);
  (c as unknown as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(value).then(res);
  return c;
};

function make(opts: { dailyTime?: string; ranToday?: boolean; configured?: boolean; run?: jest.Mock; jobRunning?: boolean; manualToday?: number; targets?: number; hasTarget?: boolean; latest?: unknown } = {}) {
  const client = { configured: opts.configured ?? true, run: opts.run ?? jest.fn().mockResolvedValue(goodResponse) };
  const results = {
    create: jest.fn().mockResolvedValue({}), countDocuments: jest.fn().mockResolvedValue(opts.manualToday ?? 0), exists: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => chain([])), findOne: jest.fn(() => chain(opts.latest ?? null)), distinct: jest.fn().mockResolvedValue([] as string[]),
  };
  const targets = {
    exists: jest.fn().mockResolvedValue(opts.hasTarget ? { _id: 1 } : null), countDocuments: jest.fn().mockResolvedValue(opts.targets ?? 0),
    findOneAndUpdate: jest.fn().mockResolvedValue({ id: 't1', url: 'https://example.com/', label: null }), find: jest.fn(() => chain([])), findOne: jest.fn(() => chain(null)),
  };
  const audits = { updateOne: jest.fn().mockResolvedValue({}), findOne: jest.fn(() => chain(null)) };
  const jobs = {
    exists: jest.fn().mockResolvedValue(opts.jobRunning ? { _id: 1 } : null), create: jest.fn().mockResolvedValue({ id: 'j1', url: 'https://example.com/', strategies: ['mobile', 'desktop'] }),
    findById: jest.fn().mockResolvedValue(null), updateOne: jest.fn().mockResolvedValue({}),
  };
  const runDoc = { results: [] as unknown[], callsUsed: 0, save: jest.fn(), status: '', error: undefined as string | undefined, rateLimited: false, finishedAt: undefined as Date | undefined };
  const runs = { exists: jest.fn().mockImplementation(async (q: { trigger?: string }) => (opts.ranToday && q.trigger === 'cron' ? { _id: 1 } : null)), create: jest.fn().mockResolvedValue(runDoc) };
  const settings = { findOne: jest.fn(() => chain(opts.dailyTime ? { key: 'speed.dailyTime', value: opts.dailyTime } : null)), updateOne: jest.fn().mockResolvedValue({}) };
  const svc = new SpeedService(client as never, { get: (_k: string, d?: string) => d } as never, targets as never, results as never, audits as never, jobs as never, runs as never, settings as never);
  return { svc, client, results, targets, audits, jobs, runs, runDoc, settings };
}

describe('SpeedService.runOne', () => {
  it('stores the result and replaces the latest recommendations', async () => {
    const { svc, results, audits } = make();
    const out = await svc.runOne('https://example.com/', 'mobile', 'scheduled');
    expect(out.ok).toBe(true);
    const saved = results.create.mock.calls[0][0];
    expect(saved).toMatchObject({ url: 'https://example.com/', strategy: 'mobile', trigger: 'scheduled', ok: true, perfScore: 91, verdict: 'pass' });
    expect(saved.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(audits.updateOne).toHaveBeenCalledWith({ url: 'https://example.com/', strategy: 'mobile' }, expect.anything(), { upsert: true });
  });

  it('returns the numbers of the finished test so the person who ran it can see them', async () => {
    const { svc } = make();
    const out = await svc.runOne('https://example.com/', 'mobile', 'manual');
    expect(out.point).toMatchObject({ perfScore: 91, verdict: 'pass', lab: expect.objectContaining({ fcp: 1000 }) });
    expect(new Date(out.point!.runAt).getTime()).not.toBeNaN();
  });

  it('records a failed test as a failed result and keeps the old recommendations', async () => {
    const { svc, results, audits } = make({ run: jest.fn().mockRejectedValue(new PsiError('quota', 'PageSpeed quota used up for now. It resets daily.', 429)) });
    const out = await svc.runOne('https://example.com/', 'desktop', 'manual');
    expect(out).toMatchObject({ ok: false, kind: 'quota' });
    expect(results.create.mock.calls[0][0]).toMatchObject({ ok: false, error: expect.stringContaining('quota') });
    expect(audits.updateOne).not.toHaveBeenCalled();
  });

  it('turns a page Lighthouse could not load into a readable failed result', async () => {
    const { svc, results } = make({ run: jest.fn().mockResolvedValue({ lighthouseResult: { runtimeError: { code: 'FAILED_DOCUMENT_REQUEST', message: 'Could not load the page' } } }) });
    expect((await svc.runOne('https://example.com/', 'mobile', 'manual')).kind).toBe('page');
    expect(results.create.mock.calls[0][0].error).toBe('Could not load the page');
  });
});

describe('SpeedService.startManual', () => {
  it('starts a test for both devices and answers with a job id', async () => {
    const { svc, jobs } = make();
    expect(await svc.startManual('https://Example.com/#x', 'both', 'a@x.com')).toEqual({ jobId: 'j1' });
    expect(jobs.create).toHaveBeenCalledWith({ url: 'https://example.com/', strategies: ['mobile', 'desktop'], status: 'queued', requestedBy: 'a@x.com', results: [] });
  });
  it('rejects addresses that are not public web pages', async () => {
    await expect(make().svc.startManual('http://localhost:3000', 'mobile', 'a')).rejects.toThrow(BadRequestException);
  });
  it('refuses to run without an API key, saying why', async () => {
    await expect(make({ configured: false }).svc.startManual('https://example.com', 'mobile', 'a')).rejects.toThrow(/API key/);
  });
  it('allows one test of a page at a time', async () => {
    await expect(make({ jobRunning: true }).svc.startManual('https://example.com', 'mobile', 'a')).rejects.toThrow(ConflictException);
  });
  it('stops at the daily limit of manual tests', async () => {
    const err = await make({ manualToday: MAX_MANUAL_RESULTS_PER_DAY }).svc.startManual('https://example.com', 'mobile', 'a').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
  });
});

describe('SpeedService targets', () => {
  it('caps the list of daily pages', async () => {
    await expect(make({ targets: MAX_TARGETS }).svc.addTarget('https://example.com/new', undefined, 'a')).rejects.toThrow(/At most/);
  });
  it('adds a page, normalised, and starts its first check', async () => {
    const { svc, targets, jobs } = make();
    await svc.addTarget('https://example.com/about/', 'About', 'a@x.com');
    expect(targets.findOneAndUpdate.mock.calls[0][0]).toEqual({ url: 'https://example.com/about' });
    expect(jobs.create).toHaveBeenCalled();
  });
  it('does not start a first check when there is no key', async () => {
    const { svc, jobs } = make({ configured: false });
    await svc.addTarget('https://example.com/about', undefined, 'a');
    expect(jobs.create).not.toHaveBeenCalled();
  });
});

describe('SpeedService.runAll', () => {
  const twoPages = (m: ReturnType<typeof make>) => {
    m.targets.find.mockReturnValue(chain([{ url: 'https://a.test/' }, { url: 'https://b.test/' }]));
  };
  it('checks every page on both devices and logs a successful run', async () => {
    const m = make();
    twoPages(m);
    const run = await m.svc.runAll('scheduled');
    expect(m.client.run).toHaveBeenCalledTimes(4);
    expect(run.status).toBe('success');
    expect(run.callsUsed).toBe(4);
  });
  it('stops at once when the quota is used up, and says so in the log', async () => {
    const m = make({ run: jest.fn().mockRejectedValue(new PsiError('quota', 'quota', 429)) });
    twoPages(m);
    const run = await m.svc.runAll('scheduled');
    expect(m.client.run).toHaveBeenCalledTimes(1);
    expect(run.status).toBe('failed');
    expect(run.rateLimited).toBe(true);
  });
  it('is partial when only some tests worked', async () => {
    const m = make({ run: jest.fn().mockResolvedValueOnce(goodResponse).mockRejectedValue(new PsiError('bad_request', 'unreachable')) });
    twoPages(m);
    expect((await m.svc.runAll('scheduled')).status).toBe('partial');
  });
  it('does not start twice and needs a key', async () => {
    const m = make();
    m.runs.exists.mockResolvedValue({ _id: 1 });
    await expect(m.svc.startRunAll()).rejects.toThrow(ConflictException);
    await expect(make({ configured: false }).svc.runAll('scheduled')).rejects.toThrow(ConflictException);
  });
});

describe('SpeedService.catchUp', () => {
  const at = new Date('2026-11-20T08:00:00Z');
  const setup = (done: string[]) => {
    const m = make({ hasTarget: true });
    m.results.distinct.mockResolvedValue(done);
    m.targets.find.mockReturnValue(chain([{ url: 'https://a.test/' }, { url: 'https://b.test/' }]));
    return m;
  };
  it('checks only the pages with no daily or first check yet today', async () => {
    const m = setup(['https://a.test/']);
    await m.svc.catchUp(at);
    expect(m.client.run.mock.calls.map((c) => c[0])).toEqual(['https://b.test/', 'https://b.test/']); // mobile and desktop
  });
  it('does nothing when every page was already checked today, or before 12:00 Bangladesh time', async () => {
    const all = setup(['https://a.test/', 'https://b.test/']);
    await all.svc.catchUp(at);
    expect(all.client.run).not.toHaveBeenCalled();
    const early = setup([]);
    await early.svc.catchUp(new Date('2026-11-20T05:00:00Z'));
    expect(early.client.run).not.toHaveBeenCalled();
  });
});

describe('SpeedService.summary', () => {
  it('compares with the day before the latest test by default', async () => {
    const { svc } = make({ latest: { day: '2026-11-20', runAt: new Date(), trigger: 'scheduled', ok: true, field: {}, lab: {} } });
    const s = await svc.summary({ url: 'https://example.com', strategy: 'mobile', to: '2026-11-20' });
    expect(s.compareDay).toBe('2026-11-19');
    expect(s.range).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(s.latest?.day).toBe('2026-11-20');
  });
  it('honours a chosen compare day and rejects bad ranges', async () => {
    const { svc } = make();
    expect((await svc.summary({ url: 'https://example.com', strategy: 'mobile', compare: '2026-11-01' })).compareDay).toBe('2026-11-01');
    await expect(svc.summary({ url: 'https://example.com', strategy: 'mobile', from: '2026-11-10', to: '2026-11-01' })).rejects.toThrow(BadRequestException);
    await expect(svc.summary({ url: 'https://example.com', strategy: 'mobile', from: '2024-01-01', to: '2026-11-01' })).rejects.toThrow(/at most/);
  });
});

describe('SpeedService daily time', () => {
  it('is 12:00 Bangladesh time until an admin changes it', async () => {
    expect(await make().svc.dailyTime()).toBe('12:00');
    expect(await make({ dailyTime: '15:30' }).svc.dailyTime()).toBe('15:30');
  });
  it('saves a valid time and rejects anything else', async () => {
    const { svc, settings } = make();
    expect(await svc.setDailyTime('09:05')).toBe('09:05');
    expect(settings.updateOne).toHaveBeenCalledWith({ key: 'speed.dailyTime' }, { $set: { value: '09:05' } }, { upsert: true });
    for (const bad of ['24:00', '9:05', '12:60', 'noon', '']) await expect(svc.setDailyTime(bad)).rejects.toThrow(BadRequestException);
  });
  it('catch-up waits for the chosen time', async () => {
    const m = make({ hasTarget: true, dailyTime: '15:30' });
    m.results.distinct.mockResolvedValue([]);
    m.targets.find.mockReturnValue(chain([{ url: 'https://a.test/' }]));
    await m.svc.catchUp(new Date('2026-11-20T09:00:00Z')); // 15:00 in Bangladesh, before 15:30
    expect(m.client.run).not.toHaveBeenCalled();
    await m.svc.catchUp(new Date('2026-11-20T09:31:00Z')); // 15:31
    expect(m.client.run).toHaveBeenCalled();
  });
});

describe('SpeedService.tick', () => {
  const targets = (m: ReturnType<typeof make>) => m.targets.find.mockReturnValue(chain([{ url: 'https://a.test/' }]));
  it('does nothing before the chosen time', async () => {
    const m = make({ hasTarget: true }); targets(m);
    await m.svc.tick(new Date('2026-11-20T05:55:00Z')); // 11:55 in Bangladesh
    expect(m.client.run).not.toHaveBeenCalled();
  });
  it('runs the daily check once the time has passed', async () => {
    const m = make({ hasTarget: true }); targets(m);
    await m.svc.tick(new Date('2026-11-20T06:03:00Z')); // 12:03
    expect(m.client.run).toHaveBeenCalledTimes(2); // mobile and desktop
  });
  it('does not start a second daily check on the same Bangladesh day, even after a failure', async () => {
    const m = make({ hasTarget: true, ranToday: true }); targets(m);
    await m.svc.tick(new Date('2026-11-20T08:00:00Z'));
    expect(m.client.run).not.toHaveBeenCalled();
  });
  it('follows a changed time', async () => {
    const m = make({ hasTarget: true, dailyTime: '18:00' }); targets(m);
    await m.svc.tick(new Date('2026-11-20T06:03:00Z')); // 12:03, before 18:00
    expect(m.client.run).not.toHaveBeenCalled();
    await m.svc.tick(new Date('2026-11-20T12:05:00Z')); // 18:05
    expect(m.client.run).toHaveBeenCalled();
  });
});
