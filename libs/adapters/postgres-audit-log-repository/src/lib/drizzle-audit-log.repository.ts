import { count, desc, eq } from 'drizzle-orm';
import type {
  AuditEventInput,
  AuditLogPage,
  AuditLogPort,
} from '@kometio/ports';
import {
  auditEvents,
  users,
  withTenant,
  type KometioDb,
} from '@kometio/postgres-db';
import { auditActionSchema } from '@kometio/shared-types';

/**
 * The activity log of a site (docs/adr/0130). Written as one INSERT and read
 * newest first, with the actor's current name and address joined from
 * `users`: the table keeps who, and the person is described when the entry is
 * read.
 */
export class DrizzleAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: KometioDb) {}

  async record(event: AuditEventInput): Promise<void> {
    await withTenant(this.db, event.tenantId, (tx) =>
      tx.insert(auditEvents).values({
        tenantId: event.tenantId,
        actorUserId: event.actorUserId,
        action: event.action,
        targetId: event.targetId ?? null,
        targetLabel: event.targetLabel ?? null,
        detail: event.detail ?? null,
      }),
    );
  }

  async list(
    tenantId: string,
    options: { page: number; pageSize: number },
  ): Promise<AuditLogPage> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: auditEvents.id,
          at: auditEvents.at,
          action: auditEvents.action,
          actorUserId: auditEvents.actorUserId,
          actorEmail: users.email,
          actorName: users.displayName,
          targetId: auditEvents.targetId,
          targetLabel: auditEvents.targetLabel,
          detail: auditEvents.detail,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(eq(auditEvents.tenantId, tenantId))
        // `id` after `at`: two entries of one instant keep one order from page to page.
        .orderBy(desc(auditEvents.at), desc(auditEvents.id))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);
      const [totals] = await tx
        .select({ total: count() })
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId));

      return {
        // An action this build does not know (written by a newer one, then
        // rolled back) is left out of the list rather than shown as nothing.
        items: rows.filter(
          (row) => auditActionSchema.safeParse(row.action).success,
        ),
        total: totals?.total ?? 0,
      };
    });
  }
}
