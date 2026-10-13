/**
 * What answering a request tells the counters: a rule that was used, an
 * address that was not found. Fire and forget — a visitor is not made to
 * wait for a count, and a count lost in a crash is not a defect. The adapter
 * batches them (docs/adr/0127).
 */
export interface RedirectTrafficPort {
  recordHit(input: { tenantId: string; redirectId: string }): void;
  recordMiss(input: { tenantId: string; siteId: string; path: string }): void;
}
