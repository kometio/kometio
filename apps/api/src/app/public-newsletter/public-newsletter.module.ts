import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  CAPTCHA_PORT,
  NEWSLETTER_PORT,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { ApiEnvModule } from '../api-env.module';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';
import { DEPLOYMENT_SITE_RESOLVER } from '../sites/deployment-site.resolver';
import { moduleDeps } from '../module-deps';
import { PublicNewsletterController } from './public-newsletter.controller';
import type { PublicNewsletterDeps } from './public-newsletter.deps';
import { PUBLIC_NEWSLETTER_DEPS } from './public-newsletter.tokens';

@Module({
  imports: [
    AdaptersModule,
    DeploymentTenantModule,
    DeploymentSiteModule,
    ApiEnvModule,
    // Same throttle as PublicFormsModule — a write endpoint is exactly
    // what a spam bot wants to hit repeatedly.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 10 }] }),
  ],
  controllers: [PublicNewsletterController],
  providers: [
    moduleDeps<PublicNewsletterDeps>(PUBLIC_NEWSLETTER_DEPS, {
      captchaPort: CAPTCHA_PORT,
      newsletterPort: NEWSLETTER_PORT,
      siteRepository: SITE_REPOSITORY,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
      deploymentSiteResolver: DEPLOYMENT_SITE_RESOLVER,
    }),
    PublicPagesThrottlerGuard,
  ],
})
export class PublicNewsletterModule {}
