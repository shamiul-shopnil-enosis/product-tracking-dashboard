import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { addDays, daysBetween, Span } from './aggregate';
import type { DemographicKey } from './ga4.constants';
import { BreakdownQuery, CardsQuery, DemographicsQuery, FrictionQuery, LandingQuery, PagesQuery, RangeQuery } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import { ClaritySyncService } from './clarity-sync.service';
import { Ga4SyncService } from './ga4-sync.service';
import { SpeedService } from './speed.service';
import { SettingsService } from './settings.service';
import { ExploreDimension, ExploreService } from './explore.service';

// Any signed-in user may read the dashboard.
const MAX_RANGE_DAYS = 400;

/** The period asked for: a custom range if given, otherwise the last N full days. A custom range must be real, finished days. */
export function spanOf(q: RangeQuery, now = new Date()): Span {
  if (!q.from && !q.to) {
    if (q.compareFrom || q.compareTo) throw new BadRequestException('A comparison needs a date range');
    return q.days ?? 14;
  }
  if (!q.from || !q.to) throw new BadRequestException('Give both a start and an end date');
  const yesterday = addDays(now.toISOString().slice(0, 10), -1);
  const valid = (d: string) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  for (const d of [q.from, q.to, q.compareFrom, q.compareTo]) if (d && !valid(d)) throw new BadRequestException(`${d} is not a real date`);
  if (q.from > q.to) throw new BadRequestException('The start date is after the end date');
  if (q.to > yesterday) throw new BadRequestException('Today is not finished yet; the range can end yesterday at the latest');
  if (daysBetween(q.from, q.to).length > MAX_RANGE_DAYS) throw new BadRequestException(`Pick at most ${MAX_RANGE_DAYS} days`);
  if ((q.compareFrom && !q.compareTo) || (!q.compareFrom && q.compareTo)) throw new BadRequestException('Give both a start and an end for the comparison');
  if (q.compareFrom && q.compareTo && q.compareFrom > q.compareTo) throw new BadRequestException('The comparison start is after its end');
  return { from: q.from, to: q.to, compareFrom: q.compareFrom, compareTo: q.compareTo };
}

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly explore: ExploreService,
    private readonly clarity: ClaritySyncService,
    private readonly ga4: Ga4SyncService,
    private readonly speed: SpeedService,
    private readonly settings: SettingsService,
  ) {}

  /** Whether the data is fresh, for the sidebar. Safe for every signed-in user: no tokens, no counts of calls. */
  @Get('status')
  async status() {
    const [s, g, p] = await Promise.all([this.clarity.status(), this.ga4.status(), this.speed.status()]);
    return {
      pagespeed: { configured: p.configured, lastRunAt: p.lastRun?.finishedAt ?? p.lastRun?.startedAt ?? null, lastRunStatus: p.lastRun?.status ?? null, daysOfData: p.daysOfData, lastDay: p.lastDay, pages: p.pages },
      ga4: { configured: g.configured, lastRunAt: g.lastRun?.finishedAt ?? g.lastRun?.startedAt ?? null, lastRunStatus: g.lastRun?.status ?? null, daysOfData: g.daysOfData, lastDay: g.lastDay },
      clarity: {
        configured: s.configured,
        lastRunAt: s.lastRun?.finishedAt ?? s.lastRun?.startedAt ?? null,
        lastRunStatus: s.lastRun?.status ?? null,
        daysOfData: s.daysOfData,
        lastDay: s.lastDay,
        /** The project code is not secret: it lets every signed-in person open the project's recordings from a table row */
        projectId: this.settings.clarityProjectId() || null,
      },
    };
  }

  @Get('overview')
  overview(@Query() q: RangeQuery) {
    return this.dashboard.overview(spanOf(q), q.traffic ?? 'human', q.threshold ?? 20);
  }

  @Get('friction')
  friction(@Query() q: FrictionQuery) {
    return this.dashboard.friction(spanOf(q), q.sort ?? 'any', q.minSessions ?? 5);
  }

  @Get('breakdown')
  breakdown(@Query() q: BreakdownQuery) {
    return this.explore.breakdown((q.dimension ?? 'channel') as ExploreDimension, spanOf(q));
  }

  @Get('pages')
  pages(@Query() q: PagesQuery) {
    return this.explore.pages(spanOf(q), q.sort ?? 'sessions', q.minSessions ?? 5);
  }

  @Get('landing-pages')
  landingPages(@Query() q: LandingQuery) {
    return this.explore.landingPages(spanOf(q), q.minSessions ?? 5);
  }

  @Get('seo')
  seo(@Query() q: RangeQuery) {
    return this.explore.ga4Seo(spanOf(q));
  }

  @Get('ga4-demographics')
  demographics(@Query() q: DemographicsQuery) {
    return this.explore.ga4Demographics((q.dimension ?? 'country') as DemographicKey, spanOf(q), q.organic === '1');
  }

  @Get('ga4-realtime')
  ga4Realtime() {
    return this.explore.ga4Realtime();
  }

  @Get('ga4-key-events')
  ga4KeyEvents(@Query() q: RangeQuery) {
    return this.explore.ga4KeyEvents(spanOf(q));
  }

  @Get('ga4-cards')
  ga4Cards(@Query() q: CardsQuery) {
    const keys = [...new Set((q.keys ?? '').split(',').map((k) => k.trim()).filter(Boolean))].slice(0, 60);
    return this.explore.ga4Cards(spanOf(q), keys, q.only === '1');
  }

  @Get('ga4-channels')
  ga4Channels(@Query() q: RangeQuery) {
    return this.explore.ga4Channels(spanOf(q));
  }
}
