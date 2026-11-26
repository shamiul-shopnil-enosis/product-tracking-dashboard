import { ConflictException, HttpException, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ProfilesService } from '../profiles/profiles.service';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { callsAllowed, previousUtcDay, summarize, usageIn, utcDay } from './budget';
import { ClarityClient, ClarityError } from './clarity.client';
import { hasDimension } from './normalize';
import {
  BREAKDOWN_KEYS, BREAKDOWNS, DAILY_LIMIT, type BreakdownKey, type SnapshotWindow, type SyncTrigger,
} from './clarity.constants';
import { MetricSnapshot, MetricSnapshotDocument, SyncRun, SyncRunDocument } from './analytics.schema';

const PROVIDER = 'clarity';
const STALE_RUN_MS = 15 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;

interface RunOptions {
  trigger: SyncTrigger;
  keys: BreakdownKey[];
  numOfDays: 1 | 3;
  window: SnapshotWindow;
  date: string;
  /** Catch-up day: stored flagged approximate, and never replaces an existing day */
  approximate?: boolean;
}

@Injectable()
export class ClaritySyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClaritySyncService.name);

  constructor(
    private readonly client: ClarityClient,
    private readonly config: ConfigService,
    @InjectModel(MetricSnapshot.name) private readonly snapshots: Model<MetricSnapshotDocument>,
    @InjectModel(SyncRun.name) private readonly runs: Model<SyncRunDocument>,
    @Optional() private readonly profiles?: ProfilesService,
  ) {}

  /** Background work runs once for every profile, each with its own token and its own 10-calls-a-day budget. */
  private each(fn: () => Promise<void>): Promise<void> {
    return this.profiles ? this.profiles.each(fn) : fn();
  }

  get enabled(): boolean {
    return this.config.get<string>('CLARITY_SYNC_ENABLED', 'true') !== 'false' && this.client.configured;
  }

  /** Calls used in the rolling window, and whether we are pausing after a refusal. */
  async usage() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.runs.find({ provider: PROVIDER, startedAt: { $gte: since } }, { startedAt: 1, callsUsed: 1, rateLimited: 1 });
    return usageIn(recent, new Date());
  }

  /** Calls available to a run of this kind right now. */
  private async allowedNow(trigger: SyncTrigger) {
    const { used, paused } = await this.usage();
    return paused ? 0 : callsAllowed(used, trigger);
  }

  /** After a restart, fill in the day the nightly job missed (the machine was off or asleep at 00:05 UTC). */
  onApplicationBootstrap() {
    // Not awaited and delayed a little, so a slow Clarity call never holds up startup.
    setTimeout(() => {
      this.each(() => this.catchUp()).catch((err) => this.logger.error(`Clarity catch-up failed: ${(err as Error).message}`));
    }, 10_000);
  }

  /**
   * A rolling 24 hours ending now is labelled with the UTC day that holds most of it, which is yesterday
   * only before 12:00 UTC. Later in the day there is no honest label, so nothing is stored.
   * Days that already exist (exact or approximate) are left alone.
   */
  async catchUp(now = new Date()) {
    if (!this.enabled) return;
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (minutes >= 12 * 60) return;
    if (minutes < 15) return; // the nightly job is about to run
    await this.run({
      // Only the totals and the pages: this leaves the rest of the call budget for the next nightly run.
      trigger: 'cron', keys: ['none', 'url'], numOfDays: 1, window: 'day', date: previousUtcDay(now), approximate: true,
    }).catch((err) => {
      // Nothing to do when another sync is running or the day's calls are spent.
      this.logger.warn(`Catch-up skipped: ${(err as Error).message}`);
    });
  }

  /** Nightly job: one clean UTC day, taken just after midnight UTC. */
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async nightly() {
    await this.each(async () => {
      if (!this.enabled) return;
      try {
        const now = new Date();
        await this.run({ trigger: 'cron', keys: BREAKDOWN_KEYS, numOfDays: 1, window: 'day', date: previousUtcDay(now) });
      } catch (err) {
        this.logger.error(`Nightly Clarity sync did not run: ${(err as Error).message}`);
      }
    });
  }

  /** Admin refresh: the last 24 hours, stored as today's rolling snapshot. */
  async manual(keys: BreakdownKey[]) {
    await this.assertCooldown();
    return this.run({ trigger: 'manual', keys, numOfDays: 1, window: 'rolling24h', date: utcDay(new Date()) });
  }

  /** One 72-hour call, stored raw, so the real response shape can be inspected. */
  async probe() {
    await this.assertCooldown();
    return this.run({ trigger: 'probe', keys: ['none'], numOfDays: 3, window: 'baseline72h', date: utcDay(new Date()) });
  }

  private async assertCooldown() {
    const last = await this.runs.findOne({ provider: PROVIDER, trigger: { $in: ['manual', 'probe'] } }).sort({ startedAt: -1 });
    if (last && Date.now() - last.startedAt.getTime() < MANUAL_COOLDOWN_MS) {
      throw new HttpException('Wait a minute between manual runs', 429);
    }
  }

  async run(opts: RunOptions): Promise<SyncRunDocument> {
    if (!this.client.configured) throw new ConflictException('CLARITY_API_TOKEN is not set on the server');

    const running = await this.runs.findOne({
      provider: PROVIDER, status: 'running', startedAt: { $gte: new Date(Date.now() - STALE_RUN_MS) },
    });
    if (running) throw new ConflictException('A Clarity sync is already running');

    const allowed = await this.allowedNow(opts.trigger);
    if (allowed === 0) throw new ConflictException('No Clarity calls available right now (10 per rolling 24 hours, or paused after a refusal)');

    const run = await this.runs.create({
      provider: PROVIDER, trigger: opts.trigger, startedAt: new Date(), status: 'running', callsUsed: 0, results: [],
    });

    let stop = false;
    for (const key of opts.keys) {
      if (stop) {
        run.results.push({ breakdown: key, outcome: 'skipped_budget' } as never);
        continue;
      }
      // The nightly job replaces an approximate catch-up day, but never an exact one.
      // A catch-up never replaces anything.
      const exists = opts.trigger === 'cron' && (await this.snapshots.exists({
        provider: PROVIDER, date: opts.date, window: opts.window, breakdown: key,
        ...(opts.approximate ? {} : { approximate: { $ne: true } }),
      }));
      if (exists) {
        run.results.push({ breakdown: key, outcome: 'skipped_exists' } as never);
        continue;
      }
      if (run.callsUsed >= allowed) {
        run.results.push({ breakdown: key, outcome: 'skipped_budget' } as never);
        continue;
      }

      // One retry for a transient failure, only if the budget still allows another call.
      for (let attempt = 0; attempt < 2; attempt++) {
        run.callsUsed += 1;
        try {
          const payload = await this.client.fetchInsights(opts.numOfDays, BREAKDOWNS[key]);
          // Clarity ignores a dimension name it does not know and returns unsplit totals, so check we got a split.
          const dims = BREAKDOWNS[key] as readonly string[];
          if (dims.length > 0 && !dims.every((d) => hasDimension(payload, d))) {
            throw new ClarityError('bad_response', `Clarity did not split the data by ${dims.join(', ')}`);
          }
          await this.snapshots.updateOne(
            { provider: PROVIDER, date: opts.date, window: opts.window, breakdown: key },
            { $set: { numOfDays: opts.numOfDays, fetchedAt: new Date(), payload, approximate: opts.approximate === true } },
            { upsert: true },
          );
          run.results.push({ breakdown: key, outcome: 'ok', rows: summarize(payload).rowCount } as never);
          break;
        } catch (err) {
          const e = err as ClarityError;
          const transient = e.kind === 'server' || e.kind === 'network';
          if (transient && attempt === 0 && run.callsUsed < allowed) continue;
          run.results.push({ breakdown: key, outcome: 'error', error: e.message } as never);
          if (e.kind === 'rate_limit') run.rateLimited = true;
          if (e.kind === 'auth' || e.kind === 'rate_limit') {
            stop = true;
            run.error = e.message;
          }
          break;
        }
      }
    }

    const done = run.results.filter((r) => r.outcome === 'ok' || r.outcome === 'skipped_exists').length;
    run.status = done === run.results.length ? 'success' : done > 0 ? 'partial' : 'failed';
    run.finishedAt = new Date();
    await run.save();
    this.logger.log(`Clarity ${opts.trigger} sync ${run.status}: ${run.callsUsed} call(s)`);
    return run;
  }

  // ---- reads for the admin page ----

  async status() {
    const [{ used, paused }, lastRun, byDay] = await Promise.all([
      this.usage(),
      this.runs.findOne({ provider: PROVIDER }).sort({ startedAt: -1 }),
      this.snapshots.distinct('date', { provider: PROVIDER, window: 'day', breakdown: 'none' }),
    ]);
    const days = (byDay as string[]).sort();
    return {
      configured: this.client.configured,
      enabled: this.enabled,
      callsUsedRecent: used,
      dailyLimit: DAILY_LIMIT,
      remainingNow: paused ? 0 : Math.max(0, DAILY_LIMIT - used),
      paused,
      daysOfData: days.length,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      lastRun: lastRun && this.toRunDto(lastRun),
    };
  }

  toRunDto(r: SyncRunDocument) {
    return {
      id: r.id, trigger: r.trigger, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt ?? null,
      callsUsed: r.callsUsed, rateLimited: r.rateLimited, error: r.error ?? null,
      results: r.results.map((x) => ({ breakdown: x.breakdown, outcome: x.outcome, error: x.error ?? null, rows: x.rows ?? null })),
    };
  }

  async recentRuns(limit = 10) {
    const runs = await this.runs.find({ provider: PROVIDER }).sort({ startedAt: -1 }).limit(limit);
    return runs.map((r) => this.toRunDto(r));
  }

  async listSnapshots(limit = 50) {
    const list = await this.snapshots.find({ provider: PROVIDER }).sort({ date: -1, fetchedAt: -1 }).limit(limit);
    return list.map((s) => ({
      id: s.id, date: s.date, window: s.window, breakdown: s.breakdown, numOfDays: s.numOfDays,
      fetchedAt: s.fetchedAt, ...summarize(s.payload),
    }));
  }

  async getSnapshot(id: string) {
    const s = await this.snapshots.findById(id);
    return s && { id: s.id, date: s.date, window: s.window, breakdown: s.breakdown, fetchedAt: s.fetchedAt, payload: s.payload };
  }
}
