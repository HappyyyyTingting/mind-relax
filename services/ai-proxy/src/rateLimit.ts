/**
 * Fixed-window request counter per signed-in user. It lives in memory, so it
 * is per instance: with Cloud Run capped at a couple of instances the real
 * ceiling is that many times the limit, which is still a hard bound on spend.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one request; returns false when the caller is over the limit. */
  allow(key: string): boolean {
    const now = this.now();
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      this.prune(now);
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count++;
    return true;
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
