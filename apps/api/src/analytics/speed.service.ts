import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  AppSetting, AppSettingDocument, SpeedAudits, SpeedAuditsDocument, SpeedJob, SpeedJobDocument, SpeedResult, SpeedResultDocument, SpeedTarget, SpeedTargetDocument,
  SyncRun, SyncRunDocument,
} from './analytics.schema';
import { addDays, BadUrl, bdDay, LighthouseError, normalizeUrl, parsePsi, pickDaily, Strategy } from './psi';
import { PsiClient, PsiError } from './psi.client';

export const PROVIDER = 'pagespeed';
export const MAX_TARGETS = 20;
export const MAX_MANUAL_RESULTS_PER_DAY = 40;
const STALE_JOB_MS = 10 * 60 * 1000;
const STALE_RUN_MS = 90 * 60 * 1000;
export const DEFAULT_DAILY_TIME = '12:00'; // Bangladesh time
const DAILY_TIME_KEY = 'speed.dailyTime';
const DAILY_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BD_OFFSET_MIN = 6 * 60;
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Minutes since midnight in Bangladesh (UTC+6). */
const bdMinutes = (now: Date) => (now.getUTCHours() * 60 + now.getUTCMinutes() + BD_OFFSET_MIN) % 1440;
const BOTH: Strategy[] = ['mobile', 'desktop'];
const MAX_RANGE_DAYS = 400;

type Trigger = 'scheduled' | 'manual' | 'added';
export type StrategyChoice = Strategy | 'both';

/** The numbers from one finished test, so a person who just ran it can see them at once. */
export interface RunPoint { runAt: string; perfScore: number | null; lab: unknown; field: unknown; verdict: string }
export interface RunOutcome { ok: boolean; error?: string; kind?: string; point?: RunPoint }

/** The reason shown to people for a failed test; never raw API text beyond what is safe to show. */
function reason(err: unknown): { message: string; kind: string } {
  if (err instanceof PsiError) return { message: err.message, kind: err.kind };
  if (err instanceof LighthouseError) return { message: err.message, kind: 'page' };
  return { message: 'The test failed unexpectedly', kind: 'unknown' };
}

@Injectable()
export class SpeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SpeedService.name);
  /** Google tests are run one at a time: they are slow, and the daily quota is shared by every run. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly client: PsiClient,
    private readonly config: ConfigService,
    @InjectModel(SpeedTarget.name) private readonly targets: Model<SpeedTargetDocument>,
    @InjectModel(SpeedResult.name) private readonly results: Model<SpeedResultDocument>,
    @InjectModel(SpeedAudits.name) private readonly audits: Model<SpeedAuditsDocument>,
    @InjectModel(SpeedJob.name) private readonly jobs: Model<SpeedJobDocument>,
    @InjectModel(SyncRun.name) private readonly runs: Model<SyncRunDocument>,
    @InjectModel(AppSetting.name) private readonly settings: Model<AppSettingDocument>,
  ) {}

  get configured(): boolean {
    return this.client.configured;
  }

  get syncEnabled(): boolean {
    return this.config.get<string>('PAGESPEED_SYNC_ENABLED', 'true') !== 'false';
  }

  get problem(): string | null {
    return this.configured ? null : 'No PageSpeed API key is set (PAGESPEED_API_KEY). Without one Google refuses most requests.';
  }

  /** True when there is something to check every day, so the health checks know to expect results. */
  async enabled(): Promise<boolean> {
    return this.syncEnabled && this.configured && (await this.targets.exists({ active: true })) !== null;
  }

  onApplicationBootstrap() {
    // A restart ends any test that was in progress; say so instead of leaving it "running" forever.
    this.jobs
      .updateMany({ status: { $in: ['queued', 'running'] } }, { $set: { status: 'failed', error: 'The server restarted before this finished' } })
      .catch(() => undefined);
    setTimeout(() => {
      this.catchUp().catch((err) => this.logger.error(`PageSpeed catch-up failed: ${(err as Error).message}`));
    }, 30_000);
  }

  /**
   * If the server was off at the daily run time, check the pages that have no daily or first check yet today.
   * Pages already checked today (even a minute ago, when they were added) are left alone to save quota.
   */
  async catchUp(now = new Date()) {
    if (!(await this.enabled()) || bdMinutes(now) < toMinutes(await this.dailyTime())) return;
    const done = new Set<string>(await this.results.distinct('url', { day: bdDay(now), trigger: { $in: ['scheduled', 'added'] } }));
    const pending = (await this.targets.find({ active: true })).map((t) => t.url).filter((u) => !done.has(u));
    if (pending.length) await this.runAll('scheduled', pending);
  }

  /** The time of the daily check, as HH:MM in Bangladesh time. */
  async dailyTime(): Promise<string> {
    const doc = await this.settings.findOne({ key: DAILY_TIME_KEY }).lean();
    return doc && DAILY_TIME_RE.test(doc.value) ? doc.value : DEFAULT_DAILY_TIME;
  }

  async setDailyTime(hhmm: string): Promise<string> {
    if (!DAILY_TIME_RE.test(hhmm)) throw new BadRequestException('Use a time like 12:00');
    await this.settings.updateOne({ key: DAILY_TIME_KEY }, { $set: { value: hhmm } }, { upsert: true });
    return hhmm;
  }

  /**
   * Looks every few minutes and starts the daily check once the chosen Bangladesh time has passed,
   * but only once per Bangladesh day, so a failed run does not keep retrying and use up the quota.
   */
  @Cron('*/5 * * * *', { timeZone: 'UTC' })
  async tick(now = new Date()) {
    try {
      if (!(await this.enabled()) || bdMinutes(now) < toMinutes(await this.dailyTime())) return;
      const dayStart = new Date(`${bdDay(now)}T00:00:00+06:00`);
      if (await this.runs.exists({ provider: PROVIDER, trigger: 'cron', startedAt: { $gte: dayStart } })) return;
      await this.runAll('scheduled');
    } catch (err) {
      this.logger.error(`Daily PageSpeed check did not run: ${(err as Error).message}`);
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  // ---- running tests ----

  /** One test of one page on one device. Stores the outcome, success or failure; never throws. */
  async runOne(url: string, strategy: Strategy, trigger: Trigger): Promise<RunOutcome> {
    const runAt = new Date();
    const base = { url, strategy, day: bdDay(runAt), runAt, trigger };
    try {
      const parsed = parsePsi(await this.client.run(url, strategy));
      await this.results.create({
        ...base, ok: true, perfScore: parsed.perfScore, lab: parsed.lab, field: parsed.field, verdict: parsed.verdict,
        finalUrl: parsed.finalUrl ?? undefined, lighthouseVersion: parsed.lighthouseVersion ?? undefined,
      });
      await this.audits.updateOne({ url, strategy }, { $set: { runAt, audits: parsed.audits } }, { upsert: true });
      return { ok: true, point: { runAt: runAt.toISOString(), perfScore: parsed.perfScore, lab: parsed.lab, field: parsed.field, verdict: parsed.verdict } };
    } catch (err) {
      const r = reason(err);
      this.logger.warn(`PageSpeed ${strategy} test of ${url} failed (${r.kind}): ${r.message}`);
      await this.results.create({ ...base, ok: false, error: r.message });
      return { ok: false, error: r.message, kind: r.kind };
    }
  }

  /** The daily check: every active page, both devices, logged like the other data sources. */
  async runAll(trigger: 'scheduled' | 'manual', only?: string[]): Promise<SyncRunDocument> {
    if (!this.configured) throw new ConflictException(this.problem as string);
    if (await this.runs.exists({ provider: PROVIDER, status: 'running', startedAt: { $gte: new Date(Date.now() - STALE_RUN_MS) } })) {
      throw new ConflictException('A PageSpeed check is already running');
    }
    const targets = (await this.targets.find({ active: true }).sort({ createdAt: 1 })).filter((t) => !only || only.includes(t.url));
    const run = await this.runs.create({ provider: PROVIDER, trigger: trigger === 'scheduled' ? 'cron' : 'manual', startedAt: new Date(), status: 'running', callsUsed: 0, results: [] });
    let stop = false;
    for (const t of targets) {
      for (const strategy of BOTH) {
        if (stop) break;
        const out = await this.enqueue(() => this.runOne(t.url, strategy, trigger === 'scheduled' ? 'scheduled' : 'manual'));
        run.callsUsed += 1;
        run.results.push({ breakdown: `${t.url} ${strategy}`, outcome: out.ok ? 'ok' : 'error', error: out.error } as never);
        if (out.kind === 'quota' || out.kind === 'key') {
          run.error = out.error; // the next tests would fail the same way
          run.rateLimited = out.kind === 'quota';
          stop = true;
        }
      }
    }
    const ok = run.results.filter((r) => r.outcome === 'ok').length;
    run.status = run.results.length === 0 ? 'success' : ok === run.results.length ? 'success' : ok > 0 ? 'partial' : 'failed';
    run.finishedAt = new Date();
    await run.save();
    this.logger.log(`PageSpeed ${trigger} check ${run.status}: ${targets.length} page(s), ${run.callsUsed} test(s)`);
    return run;
  }

  /** Admin button: run the whole daily check now, in the background. */
  async startRunAll() {
    if (!this.configured) throw new ConflictException(this.problem as string);
    if (await this.runs.exists({ provider: PROVIDER, status: 'running', startedAt: { $gte: new Date(Date.now() - STALE_RUN_MS) } })) {
      throw new ConflictException('A PageSpeed check is already running');
    }
    void this.runAll('manual').catch((err) => this.logger.error(`PageSpeed check failed: ${(err as Error).message}`));
    return { started: true };
  }

  /** Test one page now. Returns at once with a job id; the page polls it. */
  async startManual(rawUrl: string, choice: StrategyChoice, by: string) {
    const url = this.clean(rawUrl);
    if (!this.configured) throw new ConflictException(this.problem as string);
    const recent = new Date(Date.now() - STALE_JOB_MS);
    if (await this.jobs.exists({ url, status: { $in: ['queued', 'running'] }, createdAt: { $gte: recent } })) {
      throw new ConflictException('A test of this page is already running');
    }
    const used = await this.results.countDocuments({ trigger: 'manual', day: bdDay(new Date()) });
    if (used >= MAX_MANUAL_RESULTS_PER_DAY) throw new HttpException('The limit of manual tests for today is used up. The daily check still runs.', 429);
    const strategies = choice === 'both' ? BOTH : [choice];
    const job = await this.jobs.create({ url, strategies, status: 'queued', requestedBy: by, results: [] });
    this.processJob(job.id, 'manual').catch((err) => this.logger.error(`PageSpeed job failed: ${(err as Error).message}`));
    return { jobId: job.id as string };
  }

  private async processJob(id: string, trigger: Trigger) {
    const job = await this.jobs.findById(id);
    if (!job) return;
    job.status = 'running';
    await job.save();
    const done: { strategy: string; ok: boolean; error?: string; point?: RunPoint }[] = [];
    for (const strategy of job.strategies as Strategy[]) {
      const out = await this.enqueue(() => this.runOne(job.url, strategy, trigger));
      done.push({ strategy, ok: out.ok, error: out.error, point: out.point });
      await this.jobs.updateOne({ _id: id }, { $set: { results: done } });
    }
    const failed = done.every((d) => !d.ok);
    await this.jobs.updateOne({ _id: id }, { $set: { status: failed ? 'failed' : 'done', error: failed ? done[0]?.error : undefined } });
  }

  async getJob(id: string) {
    const job = isValidObjectId(id) ? await this.jobs.findById(id) : null;
    if (!job) throw new NotFoundException('Test not found');
    // A job nobody finished (for example the server stopped) must not look like it is still running.
    const stale = ['queued', 'running'].includes(job.status) && Date.now() - (job as unknown as { createdAt: Date }).createdAt.getTime() > STALE_JOB_MS;
    return {
      id: job.id, url: job.url, strategies: job.strategies, status: stale ? 'failed' : job.status,
      results: job.results, error: stale ? 'The test took too long and was dropped' : (job.error ?? null),
    };
  }

  // ---- the list of daily pages ----

  private clean(raw: string): string {
    try {
      return normalizeUrl(raw);
    } catch (err) {
      if (err instanceof BadUrl) throw new BadRequestException(err.message);
      throw err;
    }
  }

  async listTargets() {
    const list = await this.targets.find({ active: true }).sort({ createdAt: 1 });
    return list.map((t) => ({ id: t.id as string, url: t.url, label: t.label ?? null }));
  }

  async addTarget(rawUrl: string, label: string | undefined, by: string) {
    const url = this.clean(rawUrl);
    if (!(await this.targets.exists({ url, active: true })) && (await this.targets.countDocuments({ active: true })) >= MAX_TARGETS) {
      throw new BadRequestException(`At most ${MAX_TARGETS} pages can be checked every day`);
    }
    const t = await this.targets.findOneAndUpdate({ url }, { $set: { active: true, label: label?.trim() || undefined, createdBy: by } }, { upsert: true, new: true });
    // Give the new page a first reading straight away, so its history starts today.
    if (this.configured && !(await this.results.exists({ url, ok: true }))) {
      try {
        const job = await this.jobs.create({ url, strategies: BOTH, status: 'queued', requestedBy: by, results: [] });
        this.processJob(job.id, 'added').catch((err) => this.logger.error(`PageSpeed first check failed: ${(err as Error).message}`));
      } catch (err) {
        this.logger.warn(`Could not start the first check for ${url}: ${(err as Error).message}`);
      }
    }
    return { id: t.id as string, url: t.url, label: t.label ?? null };
  }

  async removeTarget(id: string) {
    const t = isValidObjectId(id) ? await this.targets.findByIdAndUpdate(id, { $set: { active: false } }) : null;
    if (!t) throw new NotFoundException('Page not found');
  }

  // ---- reads ----

  /**
   * Everything the Speed page needs for one page and device: the latest test, the one day it is compared with,
   * one value per day for the chart, and the recommendations from the latest test.
   */
  async summary(q: { url: string; strategy: Strategy; from?: string; to?: string; compare?: string }) {
    const url = this.clean(q.url);
    const today = bdDay(new Date());
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -29);
    if (from > to) throw new BadRequestException('The start date is after the end date');
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) throw new BadRequestException(`Choose a range of at most ${MAX_RANGE_DAYS} days`);

    const key = { url, strategy: q.strategy };
    const [inRange, latest, lastTry, auditDoc, target] = await Promise.all([
      this.results.find({ ...key, day: { $gte: from, $lte: to } }).sort({ runAt: 1 }).lean(),
      this.results.findOne({ ...key, ok: true }).sort({ runAt: -1 }).lean(),
      this.results.findOne(key).sort({ runAt: -1 }).lean(),
      this.audits.findOne(key).lean(),
      this.targets.findOne({ url, active: true }).lean(),
    ]);
    const daily = pickDaily(inRange);
    const compareDay = q.compare ?? (latest ? addDays(latest.day, -1) : addDays(today, -1));
    const compared = pickDaily(await this.results.find({ ...key, day: compareDay }).sort({ runAt: 1 }).lean())[0] ?? null;

    return {
      url, strategy: q.strategy, tracked: !!target, label: target?.label ?? null,
      range: { from, to }, compareDay,
      latest: latest && this.shape(latest, true),
      lastTry: lastTry && { ok: lastTry.ok, error: lastTry.error ?? null, runAt: lastTry.runAt, trigger: lastTry.trigger },
      compare: compared && this.shape(compared, false),
      series: daily.map((r) => this.shape(r, false)),
      audits: auditDoc?.audits ?? [], auditsRunAt: auditDoc?.runAt ?? null,
      configured: this.configured, problem: this.problem,
    };
  }

  /** A stored result as the page needs it. Share-of-visits bands are only worth sending for the latest test. */
  private shape(r: SpeedResult, withBands: boolean) {
    const field: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.field ?? {})) {
      field[k] = k === 'scope' || withBands || !v || typeof v !== 'object' ? v : { p75: (v as { p75: number }).p75, grade: (v as { grade: string }).grade };
    }
    return { day: r.day, runAt: r.runAt, trigger: r.trigger, perfScore: r.perfScore ?? null, verdict: r.verdict ?? 'none', lab: r.lab ?? {}, field };
  }

  // ---- status, for the Data sources page, the sidebar and the health checks ----

  async status() {
    const [lastRun, days, targetCount] = await Promise.all([
      this.runs.findOne({ provider: PROVIDER }).sort({ startedAt: -1 }),
      this.results.distinct('day', { ok: true }),
      this.targets.countDocuments({ active: true }),
    ]);
    const sorted = (days as string[]).sort();
    return {
      configured: this.configured, problem: this.problem, enabled: this.syncEnabled, pages: targetCount,
      daysOfData: sorted.length, firstDay: sorted[0] ?? null, lastDay: sorted[sorted.length - 1] ?? null,
      lastRun: lastRun && {
        id: lastRun.id, trigger: lastRun.trigger, status: lastRun.status, startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt ?? null,
        callsUsed: lastRun.callsUsed, rateLimited: lastRun.rateLimited, error: lastRun.error ?? null,
        results: lastRun.results.map((x) => ({ breakdown: x.breakdown, outcome: x.outcome, error: x.error ?? null, rows: x.rows ?? null })),
      },
    };
  }
}
