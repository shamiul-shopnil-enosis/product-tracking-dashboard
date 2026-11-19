import { LoginThrottle } from './login-throttle';

describe('LoginThrottle', () => {
  const MIN = 60_000;

  it('allows attempts until the maximum failures, then blocks', () => {
    const t = new LoginThrottle(3, 15 * MIN);
    for (let i = 0; i < 3; i++) {
      expect(t.retryAfterMs('a', i)).toBe(0);
      t.fail('a', i);
    }
    expect(t.retryAfterMs('a', 10)).toBeGreaterThan(0);
  });

  it('frees the key when the oldest failure leaves the window', () => {
    const t = new LoginThrottle(2, 10 * MIN);
    t.fail('a', 0);
    t.fail('a', MIN);
    expect(t.retryAfterMs('a', 2 * MIN)).toBe(8 * MIN);
    expect(t.retryAfterMs('a', 10 * MIN + 1)).toBe(0);
  });

  it('counts keys separately', () => {
    const t = new LoginThrottle(1, 10 * MIN);
    t.fail('a', 0);
    expect(t.retryAfterMs('a', 1)).toBeGreaterThan(0);
    expect(t.retryAfterMs('b', 1)).toBe(0);
  });

  it('reset clears a key', () => {
    const t = new LoginThrottle(1, 10 * MIN);
    t.fail('a', 0);
    t.reset('a');
    expect(t.retryAfterMs('a', 1)).toBe(0);
  });
});
