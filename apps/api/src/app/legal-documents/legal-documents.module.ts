import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import {
  PAGE_GROUP_REPOSITORY,
  PAGE_TRANSLATION_REPOSITORY,
  SITE_REPOSITORY,
} from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { moduleDeps } from '../module-deps';
import { LegalDocumentsController } from './legal-documents.controller';
import type { LegalDocumentsDeps } from './legal-documents.deps';
import { LEGAL_DOCUMENTS_DEPS } from './legal-documents.tokens';

@Module({
  imports: [AdaptersModule, AuthModule],
  controllers: [LegalDocumentsController],
  providers: [
    moduleDeps<LegalDocumentsDeps>(LEGAL_DOCUMENTS_DEPS, {
      siteRepository: SITE_REPOSITORY,
      pageGroupRepository: PAGE_GROUP_REPOSITORY,
      pageTranslationRepository: PAGE_TRANSLATION_REPOSITORY,
    }),
  ],
})
export class LegalDocumentsModule {}
