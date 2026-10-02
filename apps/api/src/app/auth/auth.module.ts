import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  AUTH_PORT,
  CAPTCHA_PORT,
  DEPLOYMENT_LOCALE,
  EMAIL_PORT,
  USER_REPOSITORY,
  VERIFICATION_TOKEN_PORT,
} from '../adapters/port.tokens';
import { ApiEnvModule } from '../api-env.module';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { moduleDeps } from '../module-deps';
import { AuthController } from './auth.controller';
import type { AuthDeps } from './auth.deps';
import { AUTH_DEPS } from './auth.tokens';
import {
  LoginThrottlerGuard,
  PerAccountThrottlerGuard,
} from './per-account-throttler.guard';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionCookies } from './session-cookies';

/**
 * Signing in and out, and the guards every other module puts in front of
 * its routes. A module that uses SessionAuthGuard or RolesGuard imports
 * this one for them, and AdaptersModule for the ports they read.
 */
@Module({
  imports: [
    AdaptersModule,
    ApiEnvModule,
    DeploymentTenantModule,
    DeploymentSiteModule,
    // Only applied to specific routes (via @UseGuards(ThrottlerGuard))
    // — not registered as a global guard, so the rest of the API is
    // unaffected.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 5 }] }),
  ],
  controllers: [AuthController],
  providers: [
    moduleDeps<AuthDeps>(AUTH_DEPS, {
      userRepository: USER_REPOSITORY,
      authPort: AUTH_PORT,
      verificationTokenPort: VERIFICATION_TOKEN_PORT,
      emailPort: EMAIL_PORT,
      deploymentLocale: DEPLOYMENT_LOCALE,
      captchaPort: CAPTCHA_PORT,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
    }),
    SessionCookies,
    SessionAuthGuard,
    RolesGuard,
    PerAccountThrottlerGuard,
    LoginThrottlerGuard,
  ],
  exports: [SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
