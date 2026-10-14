import { and, eq, lt } from 'drizzle-orm';
import { type KometioDb, withTenant } from './client';
import { auditEvents } from './schema';

export interface AuditEventsCleanupResult {
  deletedEvents: number;
}

/**
 * The activity log is a log, not a history (docs/adr/0130): what is older than
 * the retention the caller states is removed. A single DELETE, scoped to the
 * tenant by RLS and by the clause.
 */
export async function deleteAuditEventsBefore(
  db: KometioDb,
  tenantId: string,
  before: Date,
): Promise<AuditEventsCleanupResult> {
  const removed = await withTenant(db, tenantId, (tx) =>
    tx
      .delete(auditEvents)
      .where(
        and(eq(auditEvents.tenantId, tenantId), lt(auditEvents.at, before)),
      )
      .returning({ id: auditEvents.id }),
  );
  return { deletedEvents: removed.length };
}
