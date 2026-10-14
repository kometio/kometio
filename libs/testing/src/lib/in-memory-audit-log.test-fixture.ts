import { randomUUID } from 'node:crypto';
import type {
  AuditEntry,
  AuditEventInput,
  AuditLogPage,
  AuditLogPort,
} from '@kometio/ports';

/**
 * The activity log in memory: what was recorded, in order, for a test to read
 * back — and one that can be made to fail, to show that what is being done
 * does not depend on its being written.
 */
export class InMemoryAuditLog implements AuditLogPort {
  readonly events: AuditEventInput[] = [];
  private failure: Error | null = null;

  /** From now on every write fails with `error`. */
  failEveryWriteWith(error: Error): void {
    this.failure = error;
  }

  async record(event: AuditEventInput): Promise<void> {
    if (this.failure) throw this.failure;
    this.events.push(event);
  }

  async list(
    tenantId: string,
    options: { page: number; pageSize: number },
  ): Promise<AuditLogPage> {
    const mine = this.events
      .filter((event) => event.tenantId === tenantId)
      .map((event, index): AuditEntry => ({
        id: randomUUID(),
        at: new Date(1_700_000_000_000 + index * 1000),
        action: event.action,
        actorUserId: event.actorUserId,
        actorEmail: null,
        actorName: null,
        targetId: event.targetId ?? null,
        targetLabel: event.targetLabel ?? null,
        detail: event.detail ?? null,
      }))
      .reverse();
    const start = (options.page - 1) * options.pageSize;
    return {
      items: mine.slice(start, start + options.pageSize),
      total: mine.length,
    };
  }
}
