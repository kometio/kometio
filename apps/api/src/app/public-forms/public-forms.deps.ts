import type {
  AttachmentStoragePort,
  CaptchaPort,
  DeploymentLocalePort,
  EmailPort,
  FormRepositoryPort,
  FormSubmissionRepositoryPort,
  NewsletterPort,
  PageTranslationRepositoryPort,
} from '@kometio/ports';
import type { DeploymentTenantResolver } from '../deployment-tenant.resolver';

/** What the public forms module's use cases are built from (see moduleDeps). */
export interface PublicFormsDeps {
  formRepository: FormRepositoryPort;
  formSubmissionRepository: FormSubmissionRepositoryPort;
  emailPort: EmailPort;
  /** The language an email falls back to for somebody who has not chosen one (docs/adr/0100). */
  deploymentLocale: DeploymentLocalePort;
  captchaPort: CaptchaPort;
  newsletterPort: NewsletterPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  attachmentStorage: AttachmentStoragePort;
  tenant: DeploymentTenantResolver;
}
