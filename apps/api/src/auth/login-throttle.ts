/**
 * In-memory limit on failed sign-ins. Counts failures per key inside a sliding window and blocks a key
 * that has reached the maximum until its oldest failure ages out. A restart clears it, which is
 * acceptable for a single-server internal tool.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Milliseconds until the key may try again; 0 when it may try now. */
  retryAfterMs(key: string, now = Date.now()): number {
    const list = this.recent(key, now);
    if (list.length < this.max) return 0;
    return list[0] + this.windowMs - now;
  }

  fail(key: string, now = Date.now()) {
    const list = this.recent(key, now);
    list.push(now);
    this.failures.set(key, list);
    if (this.failures.size > 10_000) this.prune(now);
  }

  reset(key: string) {
    this.failures.delete(key);
  }

  private prune(now: number) {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
  }
}
