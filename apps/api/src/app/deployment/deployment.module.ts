import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApiEnvModule } from '../api-env.module';
import { DeploymentController } from './deployment.controller';

@Module({
  imports: [
    ApiEnvModule,
    // Open to anyone, so limited per visitor like the other public routes. The
    // editor asks once per page load, since its menu and its search read it
    // (docs/adr/0105), and keeps the answer for minutes: a person loading pages,
    // or the end-to-end suite walking every screen, is far below this. The
    // answer is two booleans from memory, so what the limit is for is only that
    // it is not unbounded.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 300 }] }),
  ],
  controllers: [DeploymentController],
})
export class DeploymentModule {}
