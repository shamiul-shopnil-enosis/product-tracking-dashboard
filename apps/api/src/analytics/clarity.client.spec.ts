import { ConfigService } from '@nestjs/config';
import { ClarityClient, ClarityError, errorForStatus } from './clarity.client';

const cfg = (token?: string) => ({ get: () => token }) as unknown as ConfigService;

function mockFetch(impl: () => Promise<Partial<Response>>) {
  return jest.spyOn(global, 'fetch').mockImplementation(impl as never);
}

afterEach(() => jest.restoreAllMocks());

describe('errorForStatus', () => {
  it('maps statuses to kinds', () => {
    expect(errorForStatus(401).kind).toBe('auth');
    expect(errorForStatus(403).kind).toBe('auth');
    expect(errorForStatus(429).kind).toBe('rate_limit');
    expect(errorForStatus(400).kind).toBe('bad_request');
    expect(errorForStatus(500).kind).toBe('server');
  });
});

describe('ClarityClient', () => {
  it('refuses to call without a token', async () => {
    const spy = mockFetch(async () => ({ ok: true }));
    await expect(new ClarityClient(cfg('')).fetchInsights(1, [])).rejects.toMatchObject({ kind: 'not_configured' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends the bearer token and dimensions, and returns the array', async () => {
    const spy = mockFetch(async () => ({ ok: true, status: 200, json: async () => [{ metricName: 'Traffic', information: [] }] }));
    const out = await new ClarityClient(cfg('secret-token')).fetchInsights(1, ['URL']);
    expect(out).toHaveLength(1);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('numOfDays=1');
    expect(url).toContain('dimension1=URL');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('never leaks the token in an error', async () => {
    mockFetch(async () => ({ ok: false, status: 401 }));
    let err: ClarityError | undefined;
    try {
      await new ClarityClient(cfg('secret-token')).fetchInsights(1, []);
    } catch (e) {
      err = e as ClarityError;
    }
    expect(err?.kind).toBe('auth');
    expect(err?.message).not.toContain('secret-token');
  });

  it('turns network failures into a network error', async () => {
    mockFetch(async () => {
      throw new Error('boom');
    });
    await expect(new ClarityClient(cfg('t')).fetchInsights(1, [])).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects a non-array body', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ error: 'x' }) }));
    await expect(new ClarityClient(cfg('t')).fetchInsights(1, [])).rejects.toMatchObject({ kind: 'bad_response' });
  });
});
