import { Global, Module } from '@nestjs/common';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import type { ApiEnv } from '../env-schema';
import { API_ENV, ApiEnvModule } from './api-env.module';

export const DATABASE = Symbol('DATABASE');

/**
 * One shared connection pool for the whole app — PagesModule and AuthModule
 * both need a KometioDb, and creating a separate postgres.js pool per module
 * would just duplicate the same provider for no benefit.
 */
@Global()
@Module({
  imports: [ApiEnvModule],
  providers: [
    {
      provide: DATABASE,
      useFactory: (env: ApiEnv): KometioDb =>
        createAppDb({
          host: env.POSTGRES_HOST,
          port: env.POSTGRES_PORT,
          database: env.POSTGRES_DB,
          password: env.POSTGRES_APP_PASSWORD,
        }),
      inject: [API_ENV],
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
