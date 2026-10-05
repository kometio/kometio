import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  AUTH_PORT,
  DEPLOYMENT_LOCALE,
  EMAIL_PORT,
  MEDIA_STORAGE,
  USER_REPOSITORY,
  VERIFICATION_TOKEN_PORT,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { EmailsModule } from '../emails/emails.module';
import { ApiEnvModule } from '../api-env.module';
import { moduleDeps } from '../module-deps';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { UsersController } from './users.controller';
import type { UsersDeps } from './users.deps';
import { USERS_DEPS } from './users.tokens';

@Module({
  imports: [
    AdaptersModule,
    AuthModule,
    ApiEnvModule,
    DeploymentSiteModule,
    EmailsModule,
  ],
  controllers: [UsersController],
  providers: [
    moduleDeps<UsersDeps>(USERS_DEPS, {
      userRepository: USER_REPOSITORY,
      authPort: AUTH_PORT,
      verificationTokenPort: VERIFICATION_TOKEN_PORT,
      emailPort: EMAIL_PORT,
      deploymentLocale: DEPLOYMENT_LOCALE,
      mediaStorage: MEDIA_STORAGE,
    }),
  ],
})
export class UsersModule {}
