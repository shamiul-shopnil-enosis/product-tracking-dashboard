import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy } from './psi';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
/** One test takes 15 to 60 seconds, and Google sometimes takes longer. */
const TIMEOUT_MS = 150_000;
const RETRY_WAIT_MS = 5_000;

export type PsiErrorKind = 'quota' | 'key' | 'bad_request' | 'server' | 'timeout' | 'network';

export class PsiError extends Error {
  constructor(public kind: PsiErrorKind, message: string, public status?: number) {
    super(message);
  }
}

export interface PsiRunner {
  readonly configured: boolean;
  run(url: string, strategy: Strategy): Promise<unknown>;
}

@Injectable()
export class PsiClient implements PsiRunner {
  constructor(private readonly config: ConfigService) {}

  private get key(): string {
    return (this.config.get<string>('PAGESPEED_API_KEY') ?? '').trim();
  }

  /** Without a key Google shares one small quota between everyone, which is almost always used up. */
  get configured(): boolean {
    return this.key.length > 0;
  }

  async run(url: string, strategy: Strategy): Promise<unknown> {
    try {
      return await this.once(url, strategy);
    } catch (err) {
      if (err instanceof PsiError && (err.kind === 'server' || err.kind === 'network')) {
        await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
        return this.once(url, strategy); // one retry for a hiccup on Google's side
      }
      throw err;
    }
  }

  private async once(url: string, strategy: Strategy): Promise<unknown> {
    const params = new URLSearchParams({ url, strategy, category: 'performance', locale: 'en' });
    if (this.key) params.set('key', this.key);
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const e = err as Error;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new PsiError('timeout', 'PageSpeed took too long to answer');
      throw new PsiError('network', 'Could not reach PageSpeed');
    }
    if (res.ok) return res.json();
    let message = `PageSpeed answered ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message.split('\n')[0].slice(0, 240);
    } catch {
      /* no JSON body */
    }
    message = message.replace(/key=[\w-]+/g, 'key=…'); // never echo the key into logs or the page
    if (res.status === 429) {
      throw new PsiError('quota', this.configured ? 'PageSpeed quota used up for now. It resets daily.' : 'PageSpeed refused the request: no API key is set, and the shared free quota is used up.', 429);
    }
    if (res.status === 400 && /API key|API_KEY/i.test(message)) throw new PsiError('key', 'The PageSpeed API key is not valid', 400);
    if (res.status === 403) throw new PsiError('key', 'The PageSpeed API key is not allowed to use this API. Enable "PageSpeed Insights API" for its project.', 403);
    if (res.status >= 500) throw new PsiError('server', message, res.status);
    throw new PsiError('bad_request', message, res.status); // for example a page Google could not reach
  }
}
