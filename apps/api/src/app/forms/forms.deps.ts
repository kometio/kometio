import type {
  AttachmentStoragePort,
  FormRepositoryPort,
  FormSubmissionRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';

/** What the forms module's use cases are built from (see moduleDeps). */
export interface FormsDeps {
  siteRepository: SiteRepositoryPort;
  formRepository: FormRepositoryPort;
  formSubmissionRepository: FormSubmissionRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  attachmentStorage: AttachmentStoragePort;
}
