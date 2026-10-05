import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { ApiEnvModule } from '../api-env.module';
import { AuthModule } from '../auth/auth.module';
import { DeploymentController } from './deployment.controller';

@Module({
  imports: [AdaptersModule, ApiEnvModule, AuthModule],
  controllers: [DeploymentController],
})
export class DeploymentModule {}
