import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ImportJobRepositoryPort } from '@kometio/ports';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  IMPORT_JOB_REPOSITORY,
  SITE_REPOSITORY,
  WORDPRESS_EXPORT_READER,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { moduleDeps } from '../module-deps';
import {
  DEPLOYMENT_TENANT_RESOLVER,
  type DeploymentTenantResolver,
} from '../deployment-tenant.resolver';
import { AbandonedImportJobsService } from './abandoned-import-jobs.service';
import { ImportsController } from './imports.controller';
import type { ImportsDeps } from './imports.deps';
import { IMPORTS_DEPS } from './imports.tokens';

@Module({
  imports: [
    AdaptersModule,
    AuthModule,
    DeploymentTenantModule,
    // An export is up to 512 MB written to disk before anything else is
    // checked (audit B3): ten an hour per address leaves room to retry a
    // wrong file and is still far from filling a disk.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60 * 60 * 1000, limit: 10 }],
    }),
  ],
  controllers: [ImportsController],
  providers: [
    moduleDeps<ImportsDeps>(IMPORTS_DEPS, {
      importJobRepository: IMPORT_JOB_REPOSITORY,
      siteRepository: SITE_REPOSITORY,
      exportReader: WORDPRESS_EXPORT_READER,
    }),
    {
      provide: AbandonedImportJobsService,
      useFactory: (
        importJobRepository: ImportJobRepositoryPort,
        tenant: DeploymentTenantResolver,
      ) =>
        new AbandonedImportJobsService(importJobRepository, () =>
          tenant.resolve(),
        ),
      inject: [IMPORT_JOB_REPOSITORY, DEPLOYMENT_TENANT_RESOLVER],
    },
  ],
})
export class ImportsModule {}
