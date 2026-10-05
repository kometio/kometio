import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiEnvModule } from '../api-env.module';
import { DeploymentController } from './deployment.controller';

@Module({
  imports: [
    ApiEnvModule,
    // Open to anyone, so limited per visitor like the other public routes; the
    // editor asks once per page load and keeps the answer for minutes, so this
    // is generous for a person and a wall for a script.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [DeploymentController],
})
export class DeploymentModule {}
