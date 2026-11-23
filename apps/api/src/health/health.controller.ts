import { SettingsService } from '../analytics/settings.service';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { SyncRun, SyncRunDocument } from '../analytics/analytics.schema';
import { Ga4SyncService } from '../analytics/ga4-sync.service';
import { ClaritySyncService } from '../analytics/clarity-sync.service';
import { SpeedService } from '../analytics/speed.service';
import { Public } from '../common/decorators';
import { providerHealth, ProviderHealth } from './sync-health';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(SyncRun.name) private readonly runs: Model<SyncRunDocument>,
    private readonly clarity: ClaritySyncService,
    private readonly ga4: Ga4SyncService,
    private readonly speed: SpeedService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  private async sources(): Promise<[string, boolean][]> {
    return [['clarity', this.clarity.enabled], ['ga4', this.ga4.enabled], ['pagespeed', await this.speed.enabled()]];
  }

  /** Container health: only the database decides `status`, so a late sync never restarts the app. */
  @Public()
  @Get()
  check() {
    // readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
    const db = this.connection.readyState === 1 ? 'up' : 'down';
    return { status: db === 'up' ? 'ok' : 'degraded', db };
  }

  /** For an uptime monitor: HTTP 200 body with `syncOk` false when a connected source has not synced in 36 hours. */
  @Public()
  @Get('sync')
  async sync() {
    const providers: ProviderHealth[] = [];
    for (const [name, enabled] of await this.sources()) {
      if (!enabled) continue;
      const runs = await this.runs.find({ provider: name }).sort({ startedAt: -1 }).limit(20);
      providers.push(providerHealth(name, runs, new Date()));
    }
    return { syncOk: providers.every((p) => p.ok), providers };
  }

  /**
   * For the sign-in page, which has no session. Deliberately minimal: when data last updated and who to
   * ask for access. No errors, no provider names.
   */
  @Public()
  @Get('context')
  async context() {
    let latest: Date | null = null;
    for (const [name, enabled] of await this.sources()) {
      if (!enabled) continue;
      const runs = await this.runs.find({ provider: name }).sort({ startedAt: -1 }).limit(20);
      const at = providerHealth(name, runs, new Date()).lastSuccessAt;
      if (at && (!latest || at > latest)) latest = at;
    }
    return { dataUpdatedAt: latest ? latest.toISOString() : null, accessContact: this.config.get<string>('ACCESS_CONTACT')?.trim() || null, siteName: this.settings.siteName() };
  }
}
