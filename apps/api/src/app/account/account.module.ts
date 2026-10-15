import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  AUTH_PORT,
  DEPLOYMENT_LOCALE,
  EMAIL_PORT,
  IMAGE_OPTIMIZER,
  MEDIA_STORAGE,
  SECOND_FACTOR_REPOSITORY,
  SECRET_CIPHER,
  TOTP_PORT,
  USER_REPOSITORY,
  VERIFICATION_TOKEN_PORT,
} from '../adapters/port.tokens';
import { ApiEnvModule } from '../api-env.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { moduleDeps } from '../module-deps';
import { AccountController } from './account.controller';
import type { AccountDeps } from './account.deps';
import { ACCOUNT_DEPS } from './account.tokens';
import { SecondFactorController } from './second-factor.controller';
import type { SecondFactorDeps } from './second-factor.deps';
import { SECOND_FACTOR_DEPS } from './second-factor.tokens';

@Module({
  imports: [
    AdaptersModule,
    ApiEnvModule,
    AuditModule,
    AuthModule,
    DeploymentSiteModule,
    EmailsModule,
    // The media library's limit, for the same reason: a profile picture
    // is an upload, and one account could otherwise fill the storage.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [AccountController, SecondFactorController],
  providers: [
    moduleDeps<AccountDeps>(ACCOUNT_DEPS, {
      userRepository: USER_REPOSITORY,
      mediaStorage: MEDIA_STORAGE,
      imageOptimizer: IMAGE_OPTIMIZER,
      authPort: AUTH_PORT,
      verificationTokenPort: VERIFICATION_TOKEN_PORT,
      emailPort: EMAIL_PORT,
      deploymentLocale: DEPLOYMENT_LOCALE,
    }),
    moduleDeps<SecondFactorDeps>(SECOND_FACTOR_DEPS, {
      userRepository: USER_REPOSITORY,
      authPort: AUTH_PORT,
      secondFactorRepository: SECOND_FACTOR_REPOSITORY,
      totpPort: TOTP_PORT,
      secretCipher: SECRET_CIPHER,
    }),
  ],
})
export class AccountModule {}
