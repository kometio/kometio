/**
 * Whether the deployment's database answers. Used by the health check
 * (docs/adr/0042): a container that is up but cannot reach its own
 * database should read as unhealthy, not healthy — so it asks the database
 * something, rather than answering a static 200.
 */
export interface DatabaseHealthPort {
  /** Resolves when the database answered; rejects with why it did not. */
  ping(): Promise<void>;
}
