import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  ATTACHMENT_STORAGE,
  CAPTCHA_PORT,
  DEPLOYMENT_LOCALE,
  EMAIL_PORT,
  FORM_REPOSITORY,
  FORM_SUBMISSION_REPOSITORY,
  NEWSLETTER_PORT,
  PAGE_TRANSLATION_REPOSITORY,
} from '../adapters/port.tokens';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import { DEPLOYMENT_TENANT_RESOLVER } from '../deployment-tenant.resolver';
import { moduleDeps } from '../module-deps';
import { DeploymentSiteModule } from '../sites/deployment-site.module';
import { AttachmentQuotaGuard } from './attachment-quota.guard';
import { PublicFormsController } from './public-forms.controller';
import type { PublicFormsDeps } from './public-forms.deps';
import { PUBLIC_FORMS_DEPS } from './public-forms.tokens';

@Module({
  imports: [
    AdaptersModule,
    DeploymentTenantModule,
    DeploymentSiteModule,
    // A write endpoint (unlike PublicPagesController's reads) is exactly
    // what a spam bot wants to hit repeatedly — stricter than page-view
    // traffic (120/60s) but more generous than login's 5/60s, since a
    // shared office IP can legitimately submit several different forms.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 10 }] }),
  ],
  controllers: [PublicFormsController],
  providers: [
    moduleDeps<PublicFormsDeps>(PUBLIC_FORMS_DEPS, {
      formRepository: FORM_REPOSITORY,
      formSubmissionRepository: FORM_SUBMISSION_REPOSITORY,
      emailPort: EMAIL_PORT,
      deploymentLocale: DEPLOYMENT_LOCALE,
      captchaPort: CAPTCHA_PORT,
      newsletterPort: NEWSLETTER_PORT,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      attachmentStorage: ATTACHMENT_STORAGE,
      tenant: DEPLOYMENT_TENANT_RESOLVER,
    }),
    AttachmentQuotaGuard,
  ],
})
export class PublicFormsModule {}
