import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { providerHealth, ProviderHealth } from '../health/sync-health';
import { Ga4SyncService } from './ga4-sync.service';
import { ClaritySyncService } from './clarity-sync.service';
import { SpeedService } from './speed.service';
import { SyncRun, SyncRunDocument } from './analytics.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export function alertText(problems: ProviderHealth[]): string {
  const lines = problems.map((p) => {
    const since = p.lastSuccessAt ? `last success ${p.lastSuccessAt.toISOString()}` : 'never succeeded';
    return `- ${p.provider}: ${since}${p.lastError ? `, last error: ${p.lastError}` : ''}`;
  });
  return `Product analytics: data sync needs attention\n${lines.join('\n')}`;
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly clarity: ClaritySyncService,
    private readonly ga4: Ga4SyncService,
    private readonly speed: SpeedService,
    @InjectModel(SyncRun.name) private readonly runs: Model<SyncRunDocument>,
  ) {}

  /**
   * Sync run logs are bookkeeping, so they are trimmed (default 180 days). Metric snapshots are the
   * product's history and are small, so they are kept indefinitely.
   */
  @Cron('30 4 * * *', { timeZone: 'UTC' })
  async trimRunLogs() {
    const days = Number(this.config.get('RETENTION_RUN_DAYS', '180'));
    if (!Number.isFinite(days) || days < 30) return; // refuse nonsense values rather than delete recent logs
    const res = await this.runs.deleteMany({ startedAt: { $lt: new Date(Date.now() - days * DAY_MS) }, status: { $ne: 'running' } });
    if (res.deletedCount) this.logger.log(`Trimmed ${res.deletedCount} sync run log(s) older than ${days} days`);
  }

  /** Daily at 06:00 UTC, after both nightly syncs: tell someone when a connected source has gone stale. */
  @Cron('0 6 * * *', { timeZone: 'UTC' })
  async checkSyncs() {
    try {
      const problems = await this.problems();
      if (problems.length) await this.notify(alertText(problems));
    } catch (err) {
      this.logger.error(`Sync check failed: ${(err as Error).message}`);
    }
  }

  async problems(now = new Date()): Promise<ProviderHealth[]> {
    const out: ProviderHealth[] = [];
    const sources: [string, boolean][] = [['clarity', this.clarity.enabled], ['ga4', this.ga4.enabled], ['pagespeed', await this.speed.enabled()]];
    for (const [name, enabled] of sources) {
      if (!enabled) continue;
      const runs = await this.runs.find({ provider: name }).sort({ startedAt: -1 }).limit(20);
      const h = providerHealth(name, runs, now);
      if (!h.ok) out.push(h);
    }
    return out;
  }

  /** Posts `{ text }` (works with Slack and Discord-compatible incoming webhooks) when ALERT_WEBHOOK_URL is set. */
  private async notify(text: string) {
    this.logger.warn(text.replace(/\n/g, ' '));
    const url = this.config.get<string>('ALERT_WEBHOOK_URL');
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.error(`Alert webhook answered ${res.status}`);
    } catch (err) {
      this.logger.error(`Alert webhook failed: ${(err as Error).message}`);
    }
  }
}
