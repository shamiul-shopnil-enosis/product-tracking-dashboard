import { Injectable } from '@nestjs/common';
import { RuntimeConfig } from '../settings/runtime-config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { existsSync } from 'fs';
import { Ga4Response } from './ga4';

export type Ga4ErrorKind = 'not_configured' | 'auth' | 'quota' | 'bad_request' | 'server' | 'network';

/** Rows asked for per request; a report with more rows is fetched page by page. */
export const GA4_PAGE_SIZE = 100000;
/** Stop after this many pages rather than run without end. */
export const GA4_MAX_PAGES = 10;

export class Ga4Error extends Error {
  constructor(public readonly kind: Ga4ErrorKind, message: string) {
    super(message);
  }
}

/** gRPC status codes the Data API returns: 3 invalid argument, 7 permission denied, 8 resource exhausted, 16 unauthenticated. */
export function errorForGrpc(err: unknown): Ga4Error {
  const code = (err as { code?: number })?.code;
  if (code === 7 || code === 16) return new Ga4Error('auth', 'GA4 refused the service account (no access to this property, wrong property ID, or a bad key)');
  if (code === 8) return new Ga4Error('quota', 'GA4 quota reached; it will be retried on the next run');
  if (code === 3) return new Ga4Error('bad_request', 'GA4 rejected the report request (a metric or dimension name may not exist for this property)');
  if (code === 14 || code === 4) return new Ga4Error('network', 'Could not reach GA4 (network error or timeout)');
  return new Ga4Error('server', 'GA4 returned an error');
}

export interface Ga4ReportRequest {
  dimensions: readonly string[];
  metrics: readonly string[];
  startDate: string;
  endDate: string;
  limit?: number;
  offset?: number;
  /** Only sessions from the Organic Search channel */
  organicOnly?: boolean;
  /** Leave out rows where this dimension is "(not set)" */
  nonEmptyDimension?: string;
}

/** The part of the Google client we use, so tests can replace it. */
export interface Ga4Runner {
  runReport(request: unknown): Promise<unknown[]>;
  runRealtimeReport?(request: unknown): Promise<unknown[]>;
}

export interface RealtimeUsers {
  /** People active on the site in the last 30 minutes, as GA4 counts them */
  activeUsers: number;
  windowMinutes: number;
  asOf: string;
}
/** Realtime numbers are cached this long, so many open dashboards make one GA4 call a minute. */
export const REALTIME_CACHE_MS = 60_000;

@Injectable()
export class Ga4Client {
  private runner: Ga4Runner | null = null;
  private ownRunner = false;

  constructor(private readonly config: RuntimeConfig) {}

  get propertyId(): string {
    return (this.config.get<string>('GA4_PROPERTY_ID') ?? '').trim();
  }
  private get keyFile(): string {
    return this.config.get<string>('GA4_KEY_FILE', '/run/secrets/ga4.json') as string;
  }

  /** The service-account key saved from the screen, if any. Takes the place of the key file. */
  private get keyJson(): Record<string, unknown> | null {
    const raw = this.config.get<string>('GA4_KEY_JSON');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Why GA4 is not ready, or null when it is. */
  get problem(): string | null {
    if (!/^\d+$/.test(this.propertyId)) return 'The GA4 property ID is not set (it is the number under Admin, Property details)';
    if (!this.keyJson && !existsSync(this.keyFile)) return 'No GA4 service-account key is set. Upload the key file under Data sources.';
    return null;
  }
  get configured(): boolean {
    return this.problem === null;
  }

  /** Test hook: use a fake instead of the real Google client. */
  useRunner(r: Ga4Runner) {
    this.runner = r;
  }

  private getRunner(): Ga4Runner {
    if (!this.runner) {
      const json = this.keyJson;
      this.runner = new BetaAnalyticsDataClient(json ? { credentials: json as never } : { keyFilename: this.keyFile }) as unknown as Ga4Runner;
      this.ownRunner = true;
    }
    return this.runner;
  }

  /** Forget the connection and cached numbers, after the property or key was changed. */
  reset() {
    if (this.ownRunner) { this.runner = null; this.ownRunner = false; }
    this.realtime = null;
  }

  private realtime: { at: number; value: RealtimeUsers } | null = null;

  /** Active users right now (last 30 minutes). GA4 Realtime has no dimensions here: one number. */
  async realtimeUsers(now = Date.now()): Promise<RealtimeUsers> {
    if (this.realtime && now - this.realtime.at < REALTIME_CACHE_MS) return this.realtime.value;
    const problem = this.problem;
    if (problem && !this.runner) throw new Ga4Error('not_configured', problem);
    try {
      const runner = this.getRunner();
      if (!runner.runRealtimeReport) throw new Ga4Error('server', 'GA4 client has no realtime support');
      const [res] = (await runner.runRealtimeReport({ property: `properties/${this.propertyId}`, metrics: [{ name: 'activeUsers' }] })) as [Ga4Response];
      const value = { activeUsers: Number(res.rows?.[0]?.metricValues?.[0]?.value ?? 0) || 0, windowMinutes: 30, asOf: new Date(now).toISOString() };
      this.realtime = { at: now, value };
      return value;
    } catch (err) {
      throw err instanceof Ga4Error ? err : errorForGrpc(err);
    }
  }

  async report(req: Ga4ReportRequest): Promise<Ga4Response> {
    const problem = this.problem;
    if (problem && !this.runner) throw new Ga4Error('not_configured', problem);
    try {
      const [res] = await this.getRunner().runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate: req.startDate, endDate: req.endDate }],
        dimensions: req.dimensions.map((name) => ({ name })),
        metrics: req.metrics.map((name) => ({ name })),
        limit: req.limit ?? GA4_PAGE_SIZE,
        offset: req.offset ?? 0,
        keepEmptyRows: false,
        ...(req.organicOnly ? { dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search' } } } } : {}),
        ...(req.nonEmptyDimension ? { dimensionFilter: { notExpression: { filter: { fieldName: req.nonEmptyDimension, stringFilter: { matchType: 'EXACT', value: '(not set)' } } } } } : {}),
      });
      return res as Ga4Response;
    } catch (err) {
      throw errorForGrpc(err);
    }
  }

  /**
   * Every row of a report. GA4 returns the oldest days first and cuts off at the row limit, so a long report with many
   * distinct values (for example landing pages) would silently lose its most recent days without paging.
   */
  async reportAll(req: Ga4ReportRequest, pageSize = GA4_PAGE_SIZE): Promise<Ga4Response> {
    let first: Ga4Response | null = null;
    const rows: NonNullable<Ga4Response['rows']> = [];
    for (let page = 0; page < GA4_MAX_PAGES; page++) {
      const res = await this.report({ ...req, limit: pageSize, offset: page * pageSize });
      first ??= res;
      const got = res.rows ?? [];
      rows.push(...got);
      const total = Number(res.rowCount ?? 0);
      if (got.length < pageSize || rows.length >= total) return { ...first, rows };
    }
    throw new Ga4Error('server', `GA4 report has more than ${GA4_MAX_PAGES * pageSize} rows, which is more than the app reads`);
  }
}
