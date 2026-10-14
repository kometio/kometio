import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { listAuditEvents } from '@kometio/application';
import {
  type ListActivityQuery,
  listActivityQuerySchema,
  type PaginatedActivity,
  paginatedActivitySchema,
} from '@kometio/api-contracts';
import { RequiresPermission } from '../auth/allowed.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantId } from '../auth/session-identity.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { ActivityDeps } from './activity.deps';
import { ACTIVITY_DEPS } from './activity.tokens';

/**
 * What happened on the site, for the person who runs it (docs/adr/0130): who
 * signed in and who failed to, who was invited and given what, what was
 * changed in the settings, the theme and the AI key, and who took the archive.
 * An administrator's, like the settings it is the account of.
 */
@Controller('activity')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class ActivityController {
  constructor(@Inject(ACTIVITY_DEPS) private readonly deps: ActivityDeps) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listActivityQuerySchema))
    query: ListActivityQuery,
  ): Promise<PaginatedActivity> {
    const { items, total } = await listAuditEvents(this.deps, {
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginatedActivitySchema.parse({
      items: items.map((entry) => ({
        id: entry.id,
        at: entry.at.toISOString(),
        action: entry.action,
        actor:
          entry.actorUserId !== null && entry.actorEmail !== null
            ? {
                id: entry.actorUserId,
                email: entry.actorEmail,
                displayName: entry.actorName,
              }
            : null,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        detail: entry.detail,
      })),
      total,
    });
  }
}
