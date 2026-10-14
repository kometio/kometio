import type { AuditLogPort } from '@kometio/ports';

/** What the activity module's use cases are built from (see moduleDeps). */
export interface ActivityDeps {
  auditLog: AuditLogPort;
}
