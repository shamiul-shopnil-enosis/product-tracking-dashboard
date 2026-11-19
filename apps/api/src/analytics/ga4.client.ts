import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
}

/** The part of the Google client we use, so tests can replace it. */
export interface Ga4Runner {
  runReport(request: unknown): Promise<unknown[]>;
}

@Injectable()
export class Ga4Client {
  private runner: Ga4Runner | null = null;

  constructor(private readonly config: ConfigService) {}

  get propertyId(): string {
    return (this.config.get<string>('GA4_PROPERTY_ID') ?? '').trim();
  }
  private get keyFile(): string {
    return this.config.get<string>('GA4_KEY_FILE', '/run/secrets/ga4.json');
  }

  /** Why GA4 is not ready, or null when it is. */
  get problem(): string | null {
    if (!/^\d+$/.test(this.propertyId)) return 'GA4_PROPERTY_ID is not set (it is the number under Admin, Property details)';
    if (!existsSync(this.keyFile)) return `Key file not found at ${this.keyFile}`;
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
    if (!this.runner) this.runner = new BetaAnalyticsDataClient({ keyFilename: this.keyFile }) as unknown as Ga4Runner;
    return this.runner;
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
