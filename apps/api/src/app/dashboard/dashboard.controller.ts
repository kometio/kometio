import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { getDashboardStats } from '@kometio/application';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type GetDashboardStatsQuery,
  getDashboardStatsQuerySchema,
} from './dashboard.schemas';
import type { DashboardDeps } from './dashboard.deps';
import { DASHBOARD_DEPS } from './dashboard.tokens';
import { TenantId } from '../auth/session-identity.decorator';

@Controller('dashboard')
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(@Inject(DASHBOARD_DEPS) private readonly deps: DashboardDeps) {}

  @Get('stats')
  async getStats(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(getDashboardStatsQuerySchema))
    query: GetDashboardStatsQuery,
  ) {
    return getDashboardStats(this.deps, {
      tenantId,
      siteId: query.siteId,
    });
  }
}
