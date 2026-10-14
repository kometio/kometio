import type { ExpiredRecordsPort } from '@kometio/ports';
import { AUDIT_RETENTION_DAYS } from '@kometio/shared-types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgeAuditEventsDeps {
  expiredRecords: Pick<ExpiredRecordsPort, 'deleteAuditEventsBefore'>;
}

export interface PurgeAuditEventsInput {
  tenantId: string;
  /** Now, as the caller reads it: the use case keeps no clock of its own. */
  now: Date;
}

/**
 * Removes the activity-log entries older than `AUDIT_RETENTION_DAYS`
 * (docs/adr/0130). Answers how many went, for the scheduled job's log.
 */
export async function purgeAuditEvents(
  deps: PurgeAuditEventsDeps,
  input: PurgeAuditEventsInput,
): Promise<{ deletedEvents: number }> {
  const before = new Date(input.now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS);
  return deps.expiredRecords.deleteAuditEventsBefore(input.tenantId, before);
}
