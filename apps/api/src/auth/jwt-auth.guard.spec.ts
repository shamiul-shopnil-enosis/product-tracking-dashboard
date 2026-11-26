import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AUTH_COOKIE, SessionService } from './session.service';

const NOW = () => Math.floor(Date.now() / 1000);
const jwt = new JwtService({ secret: 'test-secret' });
const session = new SessionService(jwt, { get: () => undefined } as never);
const user = { id: 'u1', name: 'A', email: 'a@x.com', role: 'viewer', active: true, tokenVersion: 2 };

function run(token: string | undefined, found: unknown = user) {
  const res = { cookie: jest.fn() };
  const req: Record<string, unknown> = { cookies: token ? { [AUTH_COOKIE]: token } : {} };
  const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
  const guard = new JwtAuthGuard({ getAllAndOverride: () => false } as never, session, { findById: async () => found } as never);
  return { result: guard.canActivate(ctx as never), req, res };
}

const sign = (claims: object, opts: object = { expiresIn: 3600 }) => jwt.signAsync(claims, opts);

describe('JwtAuthGuard', () => {
  it('lets a valid, current session through and exposes the user', async () => {
    const { result, req } = run(await sign({ sub: 'u1', v: 2, st: NOW() }));
    expect(await result).toBe(true);
    expect(req.user).toEqual({ id: 'u1', name: 'A', email: 'a@x.com', role: 'viewer', superAdmin: false, memberships: [] });
  });

  it('rejects a request with no cookie', async () => {
    await expect(run(undefined).result).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a session ended by sign-out, a password change or deactivation (counter moved on)', async () => {
    await expect(run(await sign({ sub: 'u1', v: 1, st: NOW() })).result).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token issued before sessions were versioned', async () => {
    await expect(run(await sign({ sub: 'u1' })).result).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a deactivated or missing user', async () => {
    const token = await sign({ sub: 'u1', v: 2, st: NOW() });
    await expect(run(token, { ...user, active: false }).result).rejects.toThrow(UnauthorizedException);
    await expect(run(token, null).result).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a sign-in older than the absolute limit even if it kept being renewed', async () => {
    const started = NOW() - 8 * 86400;
    await expect(run(await sign({ sub: 'u1', v: 2, st: started })).result).rejects.toThrow(UnauthorizedException);
  });

  it('does not renew a fresh token', async () => {
    const { result, res } = run(await sign({ sub: 'u1', v: 2, st: NOW() }));
    await result;
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('renews a token past the refresh age and keeps the original start time', async () => {
    const st = NOW() - 3600;
    const { result, res } = run(await sign({ sub: 'u1', v: 2, st, iat: NOW() - 3000 }));
    await result;
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const renewed = await session.read(res.cookie.mock.calls[0][1]);
    expect(renewed?.st).toBe(st);
  });
});
