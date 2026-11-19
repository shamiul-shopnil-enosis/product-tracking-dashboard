import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLARITY_ENDPOINT } from './clarity.constants';

export type ClarityErrorKind = 'not_configured' | 'auth' | 'rate_limit' | 'bad_request' | 'server' | 'network' | 'bad_response';

export class ClarityError extends Error {
  constructor(public readonly kind: ClarityErrorKind, message: string, public readonly status?: number) {
    super(message);
  }
}

/** Map an HTTP status to a typed error. Messages never include the token. */
export function errorForStatus(status: number): ClarityError {
  if (status === 401 || status === 403) {
    return new ClarityError('auth', 'Clarity rejected the API token (missing, invalid, expired or not allowed)', status);
  }
  if (status === 429) return new ClarityError('rate_limit', 'Clarity daily request limit reached', status);
  if (status === 400) return new ClarityError('bad_request', 'Clarity rejected the request parameters', status);
  return new ClarityError('server', `Clarity returned HTTP ${status}`, status);
}

@Injectable()
export class ClarityClient {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return !!this.config.get<string>('CLARITY_API_TOKEN')?.trim();
  }

  /** One call to the Data Export API. Counts as one of the 10 daily requests. */
  async fetchInsights(numOfDays: 1 | 2 | 3, dimensions: readonly string[]): Promise<unknown[]> {
    const token = this.config.get<string>('CLARITY_API_TOKEN')?.trim();
    if (!token) throw new ClarityError('not_configured', 'CLARITY_API_TOKEN is not set');

    const params = new URLSearchParams({ numOfDays: String(numOfDays) });
    dimensions.slice(0, 3).forEach((d, i) => params.set(`dimension${i + 1}`, d));

    let res: Response;
    try {
      res = await fetch(`${CLARITY_ENDPOINT}?${params}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ClarityError('network', 'Could not reach Clarity (network error or timeout)');
    }
    if (!res.ok) throw errorForStatus(res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ClarityError('bad_response', 'Clarity returned a response that is not JSON');
    }
    if (!Array.isArray(body)) throw new ClarityError('bad_response', 'Clarity returned an unexpected response shape');
    return body;
  }
}
