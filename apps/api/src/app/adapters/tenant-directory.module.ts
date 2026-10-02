import { Module } from '@nestjs/common';
import { PostgresTenantDirectory, type KometioDb } from '@kometio/postgres-db';
import { DATABASE, DatabaseModule } from '../database.module';
import { TENANT_DIRECTORY } from './port.tokens';

/**
 * The tenant directory on its own, apart from AdaptersModule: what tells
 * the deployment which tenant it is (DeploymentTenantModule) is needed by
 * the adapters that work inside that tenant, so it cannot live in the
 * module that imports it.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: TENANT_DIRECTORY,
      useFactory: (db: KometioDb) => new PostgresTenantDirectory(db),
      inject: [DATABASE],
    },
  ],
  exports: [TENANT_DIRECTORY],
})
export class TenantDirectoryModule {}
