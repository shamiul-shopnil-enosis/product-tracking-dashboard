import { ConflictException, HttpException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricSnapshot, MetricSnapshotDocument, SyncRun, SyncRunDocument } from './analytics.schema';
import { utcDay } from './budget';
import { buildSnapshots, mergeKeyEvents, rowsFromReport } from './ga4';
import { Ga4Client, Ga4Error } from './ga4.client';
import {
  GA4_BACKFILL_DAYS, GA4_BREAKDOWNS, GA4_KEY_EVENTS, GA4_LANDING_PER_DAY, GA4_RECENT_DAYS, GA4_REPORTS, GA4_SETTLE_DAYS,
} from './ga4.constants';

const PROVIDER = 'ga4';
const STALE_RUN_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const FRESH_MS = 20 * 60 * 60 * 1000;

type Trigger = 'cron' | 'manual' | 'backfill';

@Injectable()
export class Ga4SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(Ga4SyncService.name);

  constructor(
    private readonly client: Ga4Client,
    private readonly config: ConfigService,
    @InjectModel(MetricSnapshot.name) private readonly snapshots: Model<MetricSnapshotDocument>,
    @InjectModel(SyncRun.name) private readonly runs: Model<SyncRunDocument>,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('GA4_SYNC_ENABLED', 'true') !== 'false' && this.client.configured;
  }

  /** After a start: pull the history the first time, otherwise catch up if the last run is old. */
  onApplicationBootstrap() {
    setTimeout(() => {
      this.startup().catch((err) => this.logger.error(`GA4 startup sync failed: ${(err as Error).message}`));
    }, 15_000);
  }

  async startup() {
    if (!this.enabled) return;
    // A report added later (key events by name, SEO, audience) has no history yet: read 90 days for just that report.
    // Checked per report from stored days, so a report that keeps failing never makes every restart re-read the others.
    const missing: string[] = [];
    for (const key of GA4_BREAKDOWNS) {
      if (!(await this.snapshots.exists({ provider: PROVIDER, window: 'day', breakdown: key }))) missing.push(key);
    }
    if (missing.length) return void (await this.run('backfill', GA4_BACKFILL_DAYS, missing));
    const last = await this.runs.findOne({ provider: PROVIDER, status: { $in: ['success', 'partial'] } }).sort({ startedAt: -1 });
    if (!last || Date.now() - last.startedAt.getTime() > FRESH_MS) await this.run('cron', GA4_RECENT_DAYS);
  }

  /** Nightly: GA4 has usually finished the day by 03:15 UTC. Re-reads the last 3 days because GA4 revises them. */
  @Cron('15 3 * * *', { timeZone: 'UTC' })
  async nightly() {
    if (!this.enabled) return;
    try {
      await this.run('cron', GA4_RECENT_DAYS);
    } catch (err) {
      this.logger.error(`Nightly GA4 sync did not run: ${(err as Error).message}`);
    }
  }

  async manual(days: number) {
    const last = await this.runs.findOne({ provider: PROVIDER, trigger: 'manual' }).sort({ startedAt: -1 });
    if (last && Date.now() - last.startedAt.getTime() < COOLDOWN_MS) throw new HttpException('Wait a minute between manual runs', 429);
    return this.run('manual', days);
  }

  async run(trigger: Trigger, days: number, only?: readonly string[]): Promise<SyncRunDocument> {
    const problem = this.client.problem;
    if (problem) throw new ConflictException(problem);
    const running = await this.runs.findOne({ provider: PROVIDER, status: 'running', startedAt: { $gte: new Date(Date.now() - STALE_RUN_MS) } });
    if (running) throw new ConflictException('A GA4 sync is already running');

    const run = await this.runs.create({ provider: PROVIDER, trigger, startedAt: new Date(), status: 'running', callsUsed: 0, results: [] });
    const range = { startDate: `${days}daysAgo`, endDate: 'yesterday' }; // GA4 reads these in the property's own time zone
    const today = utcDay(new Date());
    const opts = { settleDays: GA4_SETTLE_DAYS, landingPerDay: GA4_LANDING_PER_DAY };

    const keys = only ?? GA4_BREAKDOWNS;
    for (const key of keys) {
      const def = GA4_REPORTS[key];
      try {
        run.callsUsed += 1;
        let rows = rowsFromReport(await this.client.reportAll({ ...range, dimensions: def.dimensions, metrics: def.metrics, organicOnly: def.organic }));
        if (key === 'none') {
          try {
            run.callsUsed += 1;
            rows = mergeKeyEvents(rows, rowsFromReport(await this.client.reportAll({ ...range, ...GA4_KEY_EVENTS })));
          } catch (err) {
            // Key events are optional: carry on without them, and say so
            this.logger.warn(`GA4 key events unavailable: ${(err as Error).message}`);
          }
        }
        const stored = buildSnapshots(key, rows, today, opts);
        for (const s of stored) {
          await this.snapshots.updateOne(
            { provider: PROVIDER, date: s.date, window: 'day', breakdown: key },
            { $set: { numOfDays: 1, fetchedAt: new Date(), payload: s.payload, approximate: s.approximate } },
            { upsert: true },
          );
        }
        run.results.push({ breakdown: key, outcome: 'ok', rows: stored.length } as never);
      } catch (err) {
        const e = err as Ga4Error;
        run.results.push({ breakdown: key, outcome: 'error', error: e.message } as never);
        if (e.kind === 'auth' || e.kind === 'quota' || e.kind === 'not_configured') {
          run.error = e.message;
          break; // the next reports would fail the same way
        }
      }
    }

    const ok = run.results.filter((r) => r.outcome === 'ok').length;
    run.status = ok === keys.length ? 'success' : ok > 0 ? 'partial' : 'failed';
    run.finishedAt = new Date();
    await run.save();
    this.logger.log(`GA4 ${trigger} sync ${run.status}: ${days} day(s), ${run.callsUsed} report(s)`);
    return run;
  }

  // ---- reads ----

  async status() {
    const [lastRun, days] = await Promise.all([
      this.runs.findOne({ provider: PROVIDER }).sort({ startedAt: -1 }),
      this.snapshots.distinct('date', { provider: PROVIDER, window: 'day', breakdown: 'none' }),
    ]);
    const sorted = (days as string[]).sort();
    return {
      configured: this.client.configured,
      problem: this.client.problem,
      enabled: this.enabled,
      daysOfData: sorted.length,
      firstDay: sorted[0] ?? null,
      lastDay: sorted[sorted.length - 1] ?? null,
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
    return (await this.runs.find({ provider: PROVIDER }).sort({ startedAt: -1 }).limit(limit)).map((r) => this.toRunDto(r));
  }
}
