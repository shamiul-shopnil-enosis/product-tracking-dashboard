import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricSnapshot, MetricSnapshotDocument } from './analytics.schema';
import { Aggregate, aggregate, daysBetween, pctChange, periodsFor, Trend, trendOf } from './aggregate';
import { AnnotationsService } from './annotations.service';
import { findAlerts, mergeAlerts } from './alerts';
import { buildHeadline, buildInsight } from './headline';
import { FindingLinksService } from './finding-links.service';
import { collectPages } from './explore';
import { aggregateGa4, Ga4Aggregate, Ga4Day, ga4Day } from './ga4';
import { DayMetrics, FrictionKey, parseOverall } from './normalize';

const PROVIDER = 'clarity';
const TILE_GROUPS: Record<string, string> = {
  sessions: 'Audience', users: 'Audience', botShare: 'Audience', pagesPerSession: 'Audience',
  scrollDepth: 'Engagement', activeTime: 'Engagement',
  quickback: 'Friction', dead: 'Friction', rage: 'Friction', scriptError: 'Friction',
  ga4Sessions: 'Google Analytics', ga4Users: 'Google Analytics', ga4Engagement: 'Google Analytics', ga4KeyEvents: 'Google Analytics',
};
const WIDE_TABLE_LIMIT = 50;

type Unit = 'count' | 'percent' | 'seconds' | 'ratio';
interface Tile {
  key: string;
  group: string;
  /** Where the number comes from, so it can be labelled */
  source: 'clarity' | 'ga4';
  label: string;
  unit: Unit;
  value: number | null;
  previous: number | null;
  change: number | null;
  trend: Trend;
  help: string;
  /** Sessions behind a rate tile; used to stop alerts on tiny counts */
  sample: number | null;
}

@Injectable()
export class DashboardService {
  private readonly excludedHosts: string[];

  constructor(
    @InjectModel(MetricSnapshot.name) private readonly snapshots: Model<MetricSnapshotDocument>,
    config: ConfigService,
    private readonly annotations: AnnotationsService,
    private readonly findingLinks: FindingLinksService,
  ) {
    this.excludedHosts = (config.get<string>('DASHBOARD_EXCLUDE_HOSTS', '') ?? '')
      .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  }

  /** The two equal periods ending on the latest full UTC day: the current one and the one before it. */
  private ranges(days: number) {
    return periodsFor(days);
  }

  private async loadDays(from: string, to: string, breakdown: string, provider = PROVIDER) {
    return this.snapshots
      .find({ provider, window: 'day', breakdown, date: { $gte: from, $lte: to } })
      .sort({ date: 1 });
  }

  private coverage(found: number, requested: number, dates: string[], approximate: string[] = []) {
    return {
      daysWithData: found, requestedDays: requested, firstDay: dates[0] ?? null, lastDay: dates[dates.length - 1] ?? null,
      approximateDays: approximate,
    };
  }

  private tile(key: string, label: string, unit: Unit, help: string, value: number | null, previous: number | null, goodWhen: 'up' | 'down' | 'neutral', sample: number | null = null, source: 'clarity' | 'ga4' = 'clarity'): Tile {
    const change = pctChange(value, previous);
    return { key, group: TILE_GROUPS[key] ?? 'Other', source, label, unit, value, previous, change, trend: trendOf(change, goodWhen), help, sample };
  }

  private tiles(cur: Aggregate, prev: Aggregate, traffic: 'human' | 'all'): Tile[] {
    const sessions = (a: Aggregate) => (a.sessionsPerDay === null ? null : traffic === 'all' ? (a.humanSessions + a.botSessions) / a.days : a.sessionsPerDay);
    const rate = (a: Aggregate, k: FrictionKey) => a.friction[k].rate;
    const sample = (k: FrictionKey) => Math.max(cur.friction[k].affected, prev.friction[k].affected);
    return [
      this.tile('sessions', traffic === 'all' ? 'Sessions per day (human and bot)' : 'Human sessions per day', 'count',
        traffic === 'all' ? 'Visits per day, real people and bots together. A session is one visit. Higher means more traffic, not necessarily more real visitors.' : 'Visits per day by real people (a session is one visit; bots are left out). Higher means more people are using the site.', sessions(cur), sessions(prev), 'up'),
      this.tile('botShare', 'Bot share', 'percent', 'Out of all visits, the share made by automated programs rather than people. Not good or bad by itself, but a sudden rise explains a jump in traffic that is not real.', cur.botShare, prev.botShare, 'neutral'),
      this.tile('users', 'Visitors per day', 'count', 'Different people seen per day, averaged. Someone who comes on three days is counted three times.', cur.avgDailyUsers, prev.avgDailyUsers, 'up'),
      this.tile('pagesPerSession', 'Pages per session', 'ratio', 'How many pages a person looks at in one visit. Higher means they keep exploring; near 1 means they leave after the first page.', cur.pagesPerSession, prev.pagesPerSession, 'up'),
      this.tile('scrollDepth', 'Scroll depth', 'percent', 'How far down a page people scroll, on average. 100% is the bottom. Higher means they read more of the page.', cur.scrollDepth, prev.scrollDepth, 'up'),
      this.tile('activeTime', 'Active time per session', 'seconds', 'How long a person is actually busy on the site per visit (clicking, scrolling, typing); an idle open tab does not count. Higher means more attention.', cur.activeTime, prev.activeTime, 'up'),
      this.tile('quickback', 'Quick-back sessions', 'percent', 'Share of visits where someone landed on a page and went straight back. Often means the page was not what they expected. Lower is better.', rate(cur, 'quickback'), rate(prev, 'quickback'), 'down', sample('quickback')),
      this.tile('dead', 'Dead-click sessions', 'percent', 'Share of visits with a click or tap that did nothing. People expected something to happen. Lower is better.', rate(cur, 'dead'), rate(prev, 'dead'), 'down', sample('dead')),
      this.tile('rage', 'Rage-click sessions', 'percent', 'Share of visits with many fast clicks in one spot, a sign of frustration (a broken button or slow page). Lower is better.', rate(cur, 'rage'), rate(prev, 'rage'), 'down', sample('rage')),
      this.tile('scriptError', 'Script-error sessions', 'percent', 'Share of visits where the page’s code failed, so something may not have worked. Lower is better.', rate(cur, 'scriptError'), rate(prev, 'scriptError'), 'down', sample('scriptError')),
    ];
  }

  /** GA4 tiles. Labels say GA4, because GA4 and Clarity count differently (GA4 only filters bots it recognises). */
  private ga4Tiles(cur: Ga4Aggregate, prev: Ga4Aggregate): Tile[] {
    const t = (key: string, label: string, unit: Unit, help: string, v: number | null, p: number | null) => this.tile(key, label, unit, help, v, p, 'up', null, 'ga4');
    const out = [
      t('ga4Sessions', 'Sessions per day (GA4)', 'count', 'Visits per day as counted by Google Analytics. It only removes bots it recognises, so it is usually higher than the human visits Clarity shows.', cur.sessionsPerDay, prev.sessionsPerDay),
      t('ga4Users', 'Active users per day (GA4)', 'count', 'People who actively used the site each day, per Google Analytics, averaged. Someone who comes on three days is counted three times.', cur.usersPerDay, prev.usersPerDay),
      t('ga4Engagement', 'Engagement rate (GA4)', 'percent', 'Share of visits that were more than a glance: longer than 10 seconds, or 2+ pages, or a key event. Higher is better; a very low number suggests automated visits.', cur.engagementRate, prev.engagementRate),
    ];
    if (cur.keyEventsPerDay !== null || prev.keyEventsPerDay !== null) {
      out.push(t('ga4KeyEvents', 'Key events per day (GA4)', 'count', 'How often per day visitors did something you marked as important in Google Analytics (for example signing up). Higher is better.', cur.keyEventsPerDay, prev.keyEventsPerDay));
    }
    return out;
  }

  private seriesPoint(date: string, d: DayMetrics | null, g?: Ga4Day | null) {
    const f = (k: FrictionKey) => (d && d.friction[k].sessions > 0 ? (d.friction[k].affected / d.friction[k].sessions) * 100 : null);
    return {
      date,
      humanSessions: d?.humanSessions ?? null,
      botSessions: d?.botSessions ?? null,
      users: d?.users ?? null,
      pagesPerSession: d?.pagesPerSession ?? null,
      scrollDepth: d?.scrollDepth ?? null,
      activeTime: d?.activeTime ?? null,
      quickback: f('quickback'),
      dead: f('dead'),
      rage: f('rage'),
      scriptError: f('scriptError'),
      ga4Sessions: g?.sessions ?? null,
      ga4Users: g?.users ?? null,
      ga4EngagementRate: g && g.sessions > 0 ? (g.engagedSessions / g.sessions) * 100 : null,
      ga4KeyEvents: g?.keyEvents ?? null,
    };
  }

  /** The most recent manual or probe snapshot: something to look at before the first full day exists. */
  private async latestSnapshot() {
    const s = await this.snapshots
      .findOne({ provider: PROVIDER, breakdown: 'none', window: { $in: ['rolling24h', 'baseline72h'] } })
      .sort({ fetchedAt: -1 });
    const metrics = s && parseOverall(s.payload);
    if (!s || !metrics) return null;
    return {
      label: s.window === 'rolling24h' ? 'Last 24 hours' : 'Last 72 hours',
      fetchedAt: s.fetchedAt,
      note: 'From a manual refresh. It is a rolling window, so it is kept apart from the daily charts.',
      botShare: metrics.humanSessions + metrics.botSessions > 0 ? (metrics.botSessions / (metrics.humanSessions + metrics.botSessions)) * 100 : null,
      metrics,
    };
  }

  async overview(days = 14, traffic: 'human' | 'all' = 'human', threshold = 20) {
    const r = this.ranges(days);
    const [curDocs, prevDocs, latest, gCurDocs, gPrevDocs] = await Promise.all([
      this.loadDays(r.from, r.to, 'none'),
      this.loadDays(r.previousFrom, r.previousTo, 'none'),
      this.latestSnapshot(),
      this.loadDays(r.from, r.to, 'none', 'ga4'),
      this.loadDays(r.previousFrom, r.previousTo, 'none', 'ga4'),
    ]);
    const parse = (docs: MetricSnapshotDocument[]) => new Map(docs.map((d) => [d.date, parseOverall(d.payload)] as const));
    const cur = parse(curDocs);
    const prev = parse(prevDocs);
    const curDays = [...cur.values()].filter((d): d is DayMetrics => !!d);
    const prevDays = [...prev.values()].filter((d): d is DayMetrics => !!d);
    const a = aggregate(curDays);
    const b = aggregate(prevDays);
    const clarityTiles = curDays.length ? this.tiles(a, b, traffic) : [];

    // GA4, when connected and stored
    const gCur = new Map(gCurDocs.map((d) => [d.date, ga4Day(d.payload)] as const));
    const gCurDays = [...gCur.values()].filter((d): d is Ga4Day => !!d);
    const gPrevDays = gPrevDocs.map((d) => ga4Day(d.payload)).filter((d): d is Ga4Day => !!d);
    const ga = aggregateGa4(gCurDays);
    const gb = aggregateGa4(gPrevDays);
    const ga4TileList = gCurDays.length ? this.ga4Tiles(ga, gb) : [];
    const tiles = [...clarityTiles, ...ga4TileList];
    return {
      ga4: {
        connected: gCurDays.length > 0,
        daysWithData: gCurDays.length,
        approximateDays: gCurDocs.filter((d) => d.approximate).map((d) => d.date),
      },
      // The two sources side by side, to explain why they differ
      sourceComparison: gCurDays.length && curDays.length
        ? { ga4SessionsPerDay: ga.sessionsPerDay, clarityHumanSessionsPerDay: a.sessionsPerDay, clarityAllSessionsPerDay: curDays.length ? (a.humanSessions + a.botSessions) / curDays.length : null }
        : null,
      range: r,
      traffic,
      annotations: await this.annotations.list(r.from, r.to),
      // Each source is judged on its own coverage, so GA4's long history is not held back by Clarity's short one
      alerts: mergeAlerts(
        findAlerts(clarityTiles, threshold, { current: curDays.length, previous: prevDays.length }, a.humanSessions),
        gCurDays.length ? findAlerts(ga4TileList, threshold, { current: gCurDays.length, previous: gPrevDays.length }, ga.sessions) : null,
      ),
      // The headline speaks for Clarity's human traffic; it uses GA4 only when Clarity has nothing to compare
      headline: (() => {
        const h = buildHeadline(clarityTiles, days);
        // With no Clarity history to compare, GA4 (which has long history) can still answer the question
        const base = !clarityTiles.some((t) => t.change !== null) && ga4TileList.some((t) => t.change !== null) ? buildHeadline(ga4TileList, days) : h;
        return base;
      })(),
      // What the changes probably mean, in one sentence, or empty when nothing needs interpreting
      insight: buildInsight([...clarityTiles, ...ga4TileList]),
      // Human sessions of the previous period, day for day, for the dashed comparison line (null where a day is missing)
      previousSessions: daysBetween(r.previousFrom, r.previousTo).map((date) => prev.get(date)?.humanSessions ?? null),
      coverage: {
        current: this.coverage(curDays.length, days, [...cur.keys()], curDocs.filter((d) => d.approximate).map((d) => d.date)),
        previous: this.coverage(prevDays.length, days, [...prev.keys()], prevDocs.filter((d) => d.approximate).map((d) => d.date)),
      },
      tiles,
      series: daysBetween(r.from, r.to).map((date) => this.seriesPoint(date, cur.get(date) ?? null, gCur.get(date) ?? null)),
      latest,
    };
  }

  async friction(days = 14, sort = 'any', minSessions = 5) {
    const r = this.ranges(days);
    const [curDocs, prevDocs, urlDocs] = await Promise.all([
      this.loadDays(r.from, r.to, 'none'),
      this.loadDays(r.previousFrom, r.previousTo, 'none'),
      this.loadDays(r.from, r.to, 'url'),
    ]);
    const days_ = (docs: MetricSnapshotDocument[]) => docs.map((d) => parseOverall(d.payload)).filter((d): d is DayMetrics => !!d);
    const cur = aggregate(days_(curDocs));
    const prev = aggregate(days_(prevDocs));
    const [annotations, openByPage] = await Promise.all([this.annotations.list(r.from, r.to), this.findingLinks.openCountsByPage()]);
    const frictionTiles = this.tiles(cur, prev, 'human').filter((t) => ['quickback', 'dead', 'rage', 'scriptError'].includes(t.key));

    // One row per page, with address variants merged and local hosts left out.
    const { pages, excludedRows: excluded, truncatedDays } = collectPages(urlDocs, this.excludedHosts);
    const rows = [...pages.entries()].map(([url, ms]) => {
      const a = aggregate(ms);
      const f = (k: FrictionKey) => ({ affected: Math.round(a.friction[k].affected), rate: a.friction[k].rate });
      const total = (['rage', 'dead', 'quickback', 'scriptError'] as FrictionKey[]).reduce((s, k) => s + a.friction[k].affected, 0);
      return {
        url, sessions: a.humanSessions, scrollDepth: a.scrollDepth, activeTime: a.activeTime, openFindings: openByPage.get(url) ?? 0,
        rage: f('rage'), dead: f('dead'), quickback: f('quickback'), scriptError: f('scriptError'), totalAffected: Math.round(total),
      };
    });
    const key = sort as 'any' | 'rage' | 'dead' | 'quickback' | 'scriptError';
    const score = (p: (typeof rows)[number]) => (key === 'any' ? p.totalAffected : p[key].affected);
    const list = rows
      .filter((p) => p.sessions >= minSessions)
      .sort((x, y) => score(y) - score(x) || y.sessions - x.sessions)
      .slice(0, WIDE_TABLE_LIMIT);

    return {
      range: r,
      annotations,
      coverage: {
        current: this.coverage(curDocs.length, days, curDocs.map((d) => d.date), curDocs.filter((d) => d.approximate).map((d) => d.date)),
        previous: this.coverage(prevDocs.length, days, prevDocs.map((d) => d.date), prevDocs.filter((d) => d.approximate).map((d) => d.date)),
        pageDays: urlDocs.length,
      },
      tiles: curDocs.length ? frictionTiles : [],
      series: daysBetween(r.from, r.to).map((date) => {
        const doc = curDocs.find((d) => d.date === date);
        return this.seriesPoint(date, doc ? parseOverall(doc.payload) : null);
      }),
      pages: list,
      notes: {
        minSessions,
        excludedLocalRows: excluded,
        truncatedDays,
        totalPages: rows.length,
        sessionNote: 'A session can have more than one kind of friction, so the page total can count it twice.',
      },
    };
  }
}
