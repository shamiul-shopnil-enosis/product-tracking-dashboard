import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricSnapshot, MetricSnapshotDocument } from './analytics.schema';
import { daysBetween, pctChange, periodsFor } from './aggregate';
import { Ga4Client } from './ga4.client';
import { dailySeries, dimensionRows, eventRows, landingRows } from './ga4';
import { BREAKDOWNS } from './clarity.constants';
import { AnnotationsService } from './annotations.service';
import { FindingLinksService } from './finding-links.service';
import { buildRows, collectDimension, collectPages, ExploreRow } from './explore';

const PROVIDER = 'clarity';
export const EXPLORE_DIMENSIONS = ['channel', 'source', 'country', 'device', 'os'] as const;
export type ExploreDimension = (typeof EXPLORE_DIMENSIONS)[number];

const LABELS: Record<ExploreDimension, string> = {
  channel: 'Channel', source: 'Source', country: 'Country', device: 'Device', os: 'Operating system',
};
const TABLE_LIMIT = 15;
const CHART_SERIES = 4;

@Injectable()
export class ExploreService {
  private readonly excludedHosts: string[];

  constructor(
    @InjectModel(MetricSnapshot.name) private readonly snapshots: Model<MetricSnapshotDocument>,
    config: ConfigService,
    private readonly annotations: AnnotationsService,
    private readonly findingLinks: FindingLinksService,
    private readonly ga4Client: Ga4Client,
  ) {
    this.excludedHosts = (config.get<string>('DASHBOARD_EXCLUDE_HOSTS', '') ?? '')
      .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  }

  private load(from: string, to: string, breakdown: string, provider = PROVIDER) {
    return this.snapshots
      .find({ provider, window: 'day', breakdown, date: { $gte: from, $lte: to } })
      .sort({ date: 1 });
  }

  private coverage(docs: MetricSnapshotDocument[], requested: number) {
    const dates = docs.map((d) => d.date);
    return {
      daysWithData: docs.length,
      requestedDays: requested,
      firstDay: dates[0] ?? null,
      lastDay: dates[dates.length - 1] ?? null,
      approximateDays: docs.filter((d) => d.approximate).map((d) => d.date),
    };
  }

  async breakdown(dimension: ExploreDimension, days: number) {
    const r = periodsFor(days);
    const dimName = BREAKDOWNS[dimension][0];
    const [curDocs, prevDocs] = await Promise.all([this.load(r.from, r.to, dimension), this.load(r.previousFrom, r.previousTo, dimension)]);
    const { rows, totalHuman } = buildRows(
      collectDimension(curDocs, dimName), collectDimension(prevDocs, dimName), curDocs.length, prevDocs.length,
    );
    rows.sort((a, b) => b.humanSessions - a.humanSessions);
    const top = rows.slice(0, CHART_SERIES);

    // Daily sessions for the biggest values. A day without data stays empty (a gap), not zero.
    const byDate = new Map(curDocs.map((d) => [d.date, collectDimension([d], dimName)] as const));
    const points = daysBetween(r.from, r.to).map((date) => {
      const m = byDate.get(date);
      const p: Record<string, number | string | null> = { date };
      top.forEach((row, i) => {
        p[`v${i}`] = m ? (m.get(row.value)?.reduce((s, x) => s + x.humanSessions, 0) ?? 0) : null;
      });
      return p;
    });

    return {
      dimension,
      label: LABELS[dimension],
      range: r,
      annotations: await this.annotations.list(r.from, r.to),
      coverage: { current: this.coverage(curDocs, days), previous: this.coverage(prevDocs, days) },
      totalHumanSessions: totalHuman,
      totalValues: rows.length,
      rows: rows.slice(0, TABLE_LIMIT),
      chart: { series: top.map((row, i) => ({ id: `v${i}`, label: row.value })), points },
      notes: {
        truncated: curDocs.some((d) => collectDimension([d], dimName).size >= 1000),
      },
    };
  }

  async pages(days: number, sort: string, minSessions: number) {
    const r = periodsFor(days);
    const [curDocs, prevDocs] = await Promise.all([this.load(r.from, r.to, 'url'), this.load(r.previousFrom, r.previousTo, 'url')]);
    const cur = collectPages(curDocs, this.excludedHosts);
    const prev = collectPages(prevDocs, this.excludedHosts);
    const { rows, totalHuman } = buildRows(cur.pages, prev.pages, curDocs.length, prevDocs.length);
    const openByPage = await this.findingLinks.openCountsByPage();

    // Sessions on a page are counted once per page, so the share is of all page views by visitors, not of sessions.
    const key = sort as 'sessions' | 'scrollDepth' | 'activeTime' | 'quickbackRate';
    const score = (x: ExploreRow) => (key === 'sessions' ? x.humanSessions : (x[key] ?? -1));
    const list = rows
      .filter((x) => x.humanSessions >= minSessions)
      .sort((a, b) => score(b) - score(a) || b.humanSessions - a.humanSessions)
      .slice(0, 50);

    return {
      range: r,
      coverage: { current: this.coverage(curDocs, days), previous: this.coverage(prevDocs, days) },
      pages: list.map((x) => ({ ...x, url: x.value, openFindings: openByPage.get(x.value) ?? 0 })),
      notes: {
        minSessions,
        totalPages: rows.length,
        totalPageSessions: totalHuman,
        excludedLocalRows: cur.excludedRows,
        truncatedDays: cur.truncatedDays,
        sessionNote: 'A session that visits several pages counts once on each of them, so the page sessions add up to more than the total sessions.',
        landingNote: 'Clarity cannot tell which page a session started on; landing pages, where sessions start, are in the GA4 table below.',
      },
    };
  }

  /** GA4 landing pages: where visits start, which Clarity cannot tell. */
  async landingPages(days: number, minSessions: number) {
    const r = periodsFor(days);
    const [curDocs, prevDocs] = await Promise.all([
      this.load(r.from, r.to, 'landing', 'ga4'),
      this.load(r.previousFrom, r.previousTo, 'landing', 'ga4'),
    ]);
    const { rows, totalSessions } = landingRows(curDocs, prevDocs, pctChange);
    return {
      connected: curDocs.length > 0,
      range: r,
      coverage: { current: this.coverage(curDocs, days), previous: this.coverage(prevDocs, days) },
      pages: rows.filter((p) => p.sessions >= minSessions).sort((a, b) => b.sessions - a.sessions).slice(0, 50),
      notes: {
        minSessions,
        totalPages: rows.length,
        totalSessions,
        source: 'Google Analytics (GA4). Landing pages are the first page of a session, as GA4 records it. GA4 only removes bots it recognises, so these counts include some automated traffic.',
      },
    };
  }

  /** Active users right now. Never throws: the Overview tile just hides itself when GA4 cannot answer. */
  async ga4Realtime() {
    if (!this.ga4Client.configured) return { available: false as const, reason: 'GA4 is not connected' };
    try {
      return { available: true as const, ...(await this.ga4Client.realtimeUsers()) };
    } catch (err) {
      return { available: false as const, reason: (err as Error).message };
    }
  }

  /** GA4 key events by event name: how many times each important action happened. */
  async ga4KeyEvents(days: number) {
    const r = periodsFor(days);
    const [curDocs, prevDocs] = await Promise.all([
      this.load(r.from, r.to, 'event', 'ga4'),
      this.load(r.previousFrom, r.previousTo, 'event', 'ga4'),
    ]);
    const { rows, total } = eventRows(curDocs, prevDocs, pctChange);
    return { connected: curDocs.length > 0, range: r, rows, total, perDay: curDocs.length ? total / curDocs.length : null };
  }

  /** GA4 sessions by default channel group: where visits come from, with how engaged they were. */
  async ga4Channels(days: number) {
    const r = periodsFor(days);
    const [curDocs, prevDocs] = await Promise.all([
      this.load(r.from, r.to, 'channel', 'ga4'),
      this.load(r.previousFrom, r.previousTo, 'channel', 'ga4'),
    ]);
    const { rows, totalSessions } = dimensionRows('sessionDefaultChannelGroup', curDocs, prevDocs, pctChange);
    return {
      connected: curDocs.length > 0,
      range: r,
      annotations: await this.annotations.list(r.from, r.to),
      coverage: { current: this.coverage(curDocs, days), previous: this.coverage(prevDocs, days) },
      rows: rows.sort((a, b) => b.sessions - a.sessions).slice(0, 12),
      totalSessions,
      chart: dailySeries('sessionDefaultChannelGroup', curDocs, daysBetween(r.from, r.to), 4),
      notes: {
        source: 'Google Analytics (GA4). GA4 only removes bots it recognises, so these counts include some automated traffic. Direct means GA4 saw no referrer, which is also how much automated traffic arrives.',
      },
    };
  }
}
