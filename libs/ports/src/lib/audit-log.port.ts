import type { AuditAction, AuditDetail } from '@kometio/shared-types';

/** What is recorded: who did what to what, and when it is now. No address, no body. */
export interface AuditEventInput {
  tenantId: string;
  /** The account that did it, or that was signed into for a failed sign-in; `null` where nobody was. */
  actorUserId: string | null;
  action: AuditAction;
  /** What it was done to (a user's id, a settings section), when there is one. */
  targetId?: string | null;
  /** How the target is named to a reader, as it was then: it may be gone by the time it is read. */
  targetLabel?: string | null;
  detail?: AuditDetail | null;
}

/** One entry, as the activity screen reads it. */
export interface AuditEntry {
  id: string;
  at: Date;
  action: AuditAction;
  actorUserId: string | null;
  /** The actor's address and name now, from their account; `null` if the account is gone or nobody was the actor. */
  actorEmail: string | null;
  actorName: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detail: AuditDetail | null;
}

export interface AuditLogPage {
  items: AuditEntry[];
  total: number;
}

/**
 * The activity log of a site (docs/adr/0130): an append-only record of
 * security and configuration events, newest first when read, kept for
 * `AUDIT_RETENTION_DAYS` and then removed by the scheduled clean-up
 * (`ExpiredRecordsPort`).
 */
export interface AuditLogPort {
  record(event: AuditEventInput): Promise<void>;
  list(
    tenantId: string,
    options: { page: number; pageSize: number },
  ): Promise<AuditLogPage>;
}
