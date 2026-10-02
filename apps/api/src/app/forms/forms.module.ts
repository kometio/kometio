import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  ATTACHMENT_STORAGE,
  FORM_REPOSITORY,
  FORM_SUBMISSION_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { FormsController } from './forms.controller';
import type { FormsDeps } from './forms.deps';
import { FORMS_DEPS } from './forms.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [FormsController],
  providers: [
    moduleDeps<FormsDeps>(FORMS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      formRepository: FORM_REPOSITORY,
      formSubmissionRepository: FORM_SUBMISSION_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
      attachmentStorage: ATTACHMENT_STORAGE,
    }),
  ],
})
export class FormsModule {}
