import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { DASHBOARD_STATS_PORT } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { DashboardController } from './dashboard.controller';
import type { DashboardDeps } from './dashboard.deps';
import { DASHBOARD_DEPS } from './dashboard.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [DashboardController],
  providers: [
    moduleDeps<DashboardDeps>(DASHBOARD_DEPS, {
      dashboardStatsPort: DASHBOARD_STATS_PORT,
    }),
  ],
})
export class DashboardModule {}
