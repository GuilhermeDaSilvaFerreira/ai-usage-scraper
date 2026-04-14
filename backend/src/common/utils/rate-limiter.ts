/**
 * Token-bucket rate limiter for external API calls.
 * Each source (Exa, SEC EDGAR, generic web) gets its own bucket.
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly delayMs: number,
  ) {}

  async acquire(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    setTimeout(() => {
      this.activeRequests--;
      const next = this.queue.shift();
      if (next) {
        this.activeRequests++;
        next();
      }
    }, this.delayMs);
  }

  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export const webRateLimiter = new RateLimiter(3, 1000);
export const exaRateLimiter = new RateLimiter(2, 500);
export const secEdgarRateLimiter = new RateLimiter(1, 1200);
