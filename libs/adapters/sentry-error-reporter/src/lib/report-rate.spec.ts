import { describe, expect, it } from 'vitest';
import { ReportRateLimit } from './report-rate';

describe('ReportRateLimit', () => {
  it('lets through up to its limit in a window, and then no more', () => {
    const limit = new ReportRateLimit(3, 60_000, () => 0);

    const taken = [1, 2, 3, 4, 5].map(() => limit.take());

    expect(taken).toEqual([true, true, true, false, false]);
  });

  it('starts again with the next window', () => {
    let now = 0;
    const limit = new ReportRateLimit(2, 60_000, () => now);
    limit.take();
    limit.take();
    expect(limit.take()).toBe(false);

    now = 60_000;

    expect(limit.take()).toBe(true);
  });
});
