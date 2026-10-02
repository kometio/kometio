import { Module } from '@nestjs/common';
import { validateApiEnv, type ApiEnv } from '../env-schema';

export const API_ENV = Symbol('API_ENV');

/**
 * The environment, validated and typed (env-schema.ts), for whatever is
 * built from it: an adapter's settings, a cookie's `Secure`, the origin
 * the API accepts writes from. main.ts validates it first, before Nest
 * starts, so a missing variable is reported with all the others; this
 * reads the same variables again, and cannot fail where that did not.
 */
@Module({
  providers: [{ provide: API_ENV, useFactory: (): ApiEnv => validateApiEnv() }],
  exports: [API_ENV],
})
export class ApiEnvModule {}
