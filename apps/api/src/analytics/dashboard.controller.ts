import { Controller, Get, Query } from '@nestjs/common';
import { BreakdownQuery, FrictionQuery, LandingQuery, PagesQuery, RangeQuery } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import { ClaritySyncService } from './clarity-sync.service';
import { Ga4SyncService } from './ga4-sync.service';
import { ExploreDimension, ExploreService } from './explore.service';

// Any signed-in user may read the dashboard.
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly explore: ExploreService,
    private readonly clarity: ClaritySyncService,
    private readonly ga4: Ga4SyncService,
  ) {}

  /** Whether the data is fresh, for the sidebar. Safe for every signed-in user: no tokens, no counts of calls. */
  @Get('status')
  async status() {
    const [s, g] = await Promise.all([this.clarity.status(), this.ga4.status()]);
    return {
      ga4: { configured: g.configured, lastRunAt: g.lastRun?.finishedAt ?? g.lastRun?.startedAt ?? null, lastRunStatus: g.lastRun?.status ?? null, daysOfData: g.daysOfData, lastDay: g.lastDay },
      clarity: {
        configured: s.configured,
        lastRunAt: s.lastRun?.finishedAt ?? s.lastRun?.startedAt ?? null,
        lastRunStatus: s.lastRun?.status ?? null,
        daysOfData: s.daysOfData,
        lastDay: s.lastDay,
      },
    };
  }

  @Get('overview')
  overview(@Query() q: RangeQuery) {
    return this.dashboard.overview(q.days ?? 14, q.traffic ?? 'human', q.threshold ?? 20);
  }

  @Get('friction')
  friction(@Query() q: FrictionQuery) {
    return this.dashboard.friction(q.days ?? 14, q.sort ?? 'any', q.minSessions ?? 5);
  }

  @Get('breakdown')
  breakdown(@Query() q: BreakdownQuery) {
    return this.explore.breakdown((q.dimension ?? 'channel') as ExploreDimension, q.days ?? 14);
  }

  @Get('pages')
  pages(@Query() q: PagesQuery) {
    return this.explore.pages(q.days ?? 14, q.sort ?? 'sessions', q.minSessions ?? 5);
  }

  @Get('landing-pages')
  landingPages(@Query() q: LandingQuery) {
    return this.explore.landingPages(q.days ?? 14, q.minSessions ?? 5);
  }

  @Get('ga4-realtime')
  ga4Realtime() {
    return this.explore.ga4Realtime();
  }

  @Get('ga4-key-events')
  ga4KeyEvents(@Query() q: RangeQuery) {
    return this.explore.ga4KeyEvents(q.days ?? 14);
  }

  @Get('ga4-channels')
  ga4Channels(@Query() q: RangeQuery) {
    return this.explore.ga4Channels(q.days ?? 14);
  }
}
