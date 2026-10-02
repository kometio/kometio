import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AdaptersModule],
  controllers: [HealthController],
})
export class HealthModule {}
