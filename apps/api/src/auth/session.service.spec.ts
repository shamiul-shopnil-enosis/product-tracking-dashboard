import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';

const make = (env: Record<string, string> = {}) =>
  new SessionService(new JwtService({ secret: 'test-secret' }), { get: (k: string) => env[k] } as never);

describe('SessionService', () => {
  it('uses a 12 hour idle window and a 7 day limit by default', () => {
    const s = make();
    expect(s.idleSeconds).toBe(12 * 3600);
    expect(s.maxSeconds).toBe(7 * 86400);
    expect(s.refreshAfterSeconds).toBe(900);
  });

  it('reads the windows from the environment and ignores nonsense', () => {
    expect(make({ SESSION_IDLE_HOURS: '1', SESSION_MAX_DAYS: '2' }).idleSeconds).toBe(3600);
    expect(make({ SESSION_IDLE_HOURS: 'abc' }).idleSeconds).toBe(12 * 3600);
  });

  it('round-trips the claims and carries the session counter and start time', async () => {
    const s = make();
    const token = await s.sign({ id: 'u1', tokenVersion: 5 }, 1000);
    expect(await s.read(token)).toMatchObject({ sub: 'u1', v: 5, st: 1000 });
  });

  it('treats a missing counter as 0', async () => {
    const s = make();
    expect((await s.read(await s.sign({ id: 'u1' })))?.v).toBe(0);
  });

  it('rejects garbage, a forged signature and a token from before sessions were versioned', async () => {
    const s = make();
    expect(await s.read('not-a-token')).toBeNull();
    expect(await s.read(await new JwtService({ secret: 'other' }).signAsync({ sub: 'u1', v: 0, st: 1 }))).toBeNull();
    expect(await s.read(await new JwtService({ secret: 'test-secret' }).signAsync({ sub: 'u1' }))).toBeNull();
  });

  it('rejects an expired token', async () => {
    const s = make();
    const old = await new JwtService({ secret: 'test-secret' }).signAsync({ sub: 'u1', v: 0, st: 1 }, { expiresIn: -10 });
    expect(await s.read(old)).toBeNull();
  });
});
