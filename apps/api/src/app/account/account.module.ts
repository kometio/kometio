import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  AUTH_PORT,
  DEPLOYMENT_LOCALE,
  EMAIL_PORT,
  MEDIA_STORAGE,
  USER_REPOSITORY,
  VERIFICATION_TOKEN_PORT,
} from '../adapters/port.tokens';
import { ApiEnvModule } from '../api-env.module';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { moduleDeps } from '../module-deps';
import { AccountController } from './account.controller';
import type { AccountDeps } from './account.deps';
import { ACCOUNT_DEPS } from './account.tokens';

@Module({
  imports: [
    AdaptersModule,
    ApiEnvModule,
    AuthModule,
    DeploymentSiteModule,
    EmailsModule,
    // The media library's limit, for the same reason: a profile picture
    // is an upload, and one account could otherwise fill the storage.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 30 }] }),
  ],
  controllers: [AccountController],
  providers: [
    moduleDeps<AccountDeps>(ACCOUNT_DEPS, {
      userRepository: USER_REPOSITORY,
      mediaStorage: MEDIA_STORAGE,
      authPort: AUTH_PORT,
      verificationTokenPort: VERIFICATION_TOKEN_PORT,
      emailPort: EMAIL_PORT,
      deploymentLocale: DEPLOYMENT_LOCALE,
    }),
  ],
})
export class AccountModule {}
