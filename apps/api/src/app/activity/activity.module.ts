import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { AUDIT_LOG } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { ActivityController } from './activity.controller';
import type { ActivityDeps } from './activity.deps';
import { ACTIVITY_DEPS } from './activity.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [ActivityController],
  providers: [moduleDeps<ActivityDeps>(ACTIVITY_DEPS, { auditLog: AUDIT_LOG })],
})
export class ActivityModule {}
