import type { AuditLogPage, AuditLogPort } from '@kometio/ports';

export interface ListAuditEventsDeps {
  auditLog: AuditLogPort;
}

export interface ListAuditEventsInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

/** The site's activity, newest first (docs/adr/0130): what the administrator's Activity screen reads. */
export function listAuditEvents(
  deps: ListAuditEventsDeps,
  input: ListAuditEventsInput,
): Promise<AuditLogPage> {
  return deps.auditLog.list(input.tenantId, {
    page: input.page,
    pageSize: input.pageSize,
  });
}
