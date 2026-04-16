import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('acquire', () => {
    it('should resolve immediately when under concurrency limit', async () => {
      const limiter = new RateLimiter(2, 100);
      await limiter.acquire();
      await limiter.acquire();
    });

    it('should queue when at concurrency limit', async () => {
      const limiter = new RateLimiter(1, 100);
      await limiter.acquire();

      let acquired = false;
      const pending = limiter.acquire().then(() => {
        acquired = true;
      });

      await Promise.resolve();
      expect(acquired).toBe(false);

      limiter.release();
      jest.advanceTimersByTime(100);
      await pending;
      expect(acquired).toBe(true);
    });

    it('should queue multiple requests in order', async () => {
      const limiter = new RateLimiter(1, 50);
      await limiter.acquire();

      const order: number[] = [];
      const p1 = limiter.acquire().then(() => order.push(1));
      const p2 = limiter.acquire().then(() => order.push(2));

      limiter.release();
      jest.advanceTimersByTime(50);
      await p1;

      limiter.release();
      jest.advanceTimersByTime(50);
      await p2;

      expect(order).toEqual([1, 2]);
    });
  });

  describe('release', () => {
    it('should decrement active count after delay', async () => {
      const limiter = new RateLimiter(1, 200);
      await limiter.acquire();

      limiter.release();

      let secondAcquired = false;
      const pending = limiter.acquire().then(() => {
        secondAcquired = true;
      });

      await Promise.resolve();
      expect(secondAcquired).toBe(false);

      jest.advanceTimersByTime(200);
      await pending;
      expect(secondAcquired).toBe(true);
    });

    it('should process queued requests after delay', async () => {
      const limiter = new RateLimiter(1, 100);
      await limiter.acquire();

      let resolved = false;
      const pending = limiter.acquire().then(() => {
        resolved = true;
      });

      limiter.release();

      await Promise.resolve();
      expect(resolved).toBe(false);

      jest.advanceTimersByTime(100);
      await pending;
      expect(resolved).toBe(true);
    });

    it('should not process queue if empty', async () => {
      const limiter = new RateLimiter(2, 100);
      await limiter.acquire();

      limiter.release();
      jest.advanceTimersByTime(100);

      await limiter.acquire();
    });
  });

  describe('wrap', () => {
    it('should acquire before calling fn and release after', async () => {
      const limiter = new RateLimiter(1, 50);
      const fn = jest.fn().mockResolvedValue('result');

      const resultPromise = limiter.wrap(fn);
      const result = await resultPromise;

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');

      jest.advanceTimersByTime(50);
    });

    it('should release even when fn throws', async () => {
      const limiter = new RateLimiter(1, 50);
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(limiter.wrap(fn)).rejects.toThrow('fail');

      jest.advanceTimersByTime(50);

      const fn2 = jest.fn().mockResolvedValue('ok');
      const result = await limiter.wrap(fn2);
      expect(result).toBe('ok');
    });

    it('should respect concurrency when wrapping multiple calls', async () => {
      const limiter = new RateLimiter(1, 50);
      const calls: string[] = [];

      let resolve1!: () => void;
      const fn1 = jest.fn(
        () =>
          new Promise<void>((r) => {
            resolve1 = r;
            calls.push('fn1-start');
          }),
      );
      let resolve2!: () => void;
      const fn2 = jest.fn(
        () =>
          new Promise<void>((r) => {
            resolve2 = r;
            calls.push('fn2-start');
          }),
      );

      const p1 = limiter.wrap(fn1);
      const p2 = limiter.wrap(fn2);

      await Promise.resolve();
      expect(calls).toEqual(['fn1-start']);

      resolve1();
      await p1;
      await jest.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();

      expect(calls).toEqual(['fn1-start', 'fn2-start']);

      resolve2();
      await p2;
      jest.advanceTimersByTime(50);
    });

    it('should return the value from the wrapped function', async () => {
      const limiter = new RateLimiter(3, 100);
      const result = await limiter.wrap(async () => 42);
      expect(result).toBe(42);
      jest.advanceTimersByTime(100);
    });
  });

  describe('concurrency limits', () => {
    it('should allow up to maxConcurrent simultaneous acquires', async () => {
      const limiter = new RateLimiter(3, 100);

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      let fourthAcquired = false;
      limiter.acquire().then(() => {
        fourthAcquired = true;
      });

      await Promise.resolve();
      expect(fourthAcquired).toBe(false);
    });
  });
});
