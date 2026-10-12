/**
 * At most `limit` reports in each window of `windowMs`.
 *
 * What is reported is what nobody expected, and a visitor who can make the
 * server throw can make it throw as often as they like: every report is a
 * request to somebody else's service and a place in a quota. A fixed window,
 * not a token bucket: the bound is what matters, not the smoothness.
 */
export class ReportRateLimit {
  private windowStart = Number.NEGATIVE_INFINITY;
  private taken = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether one more report may go out now. */
  take(): boolean {
    const at = this.now();
    if (at - this.windowStart >= this.windowMs) {
      this.windowStart = at;
      this.taken = 0;
    }
    if (this.taken >= this.limit) return false;
    this.taken += 1;
    return true;
  }
}
