import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { AuditRecorder } from './audit-recorder';

/**
 * Imported explicitly by each module whose controller records an entry
 * (docs/adr/0130), as EmailsModule is, rather than marked `@Global`: a global
 * module is only in the graph once something imports it, which would break
 * every integration test that builds a smaller one.
 */
@Module({
  imports: [AdaptersModule],
  providers: [AuditRecorder],
  exports: [AuditRecorder],
})
export class AuditModule {}
