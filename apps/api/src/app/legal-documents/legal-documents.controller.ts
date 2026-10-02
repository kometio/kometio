import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  generateLegalDocuments,
  LEGAL_DOCUMENT_TEMPLATES,
  resolveTemplateLocale,
} from '@kometio/application';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  generateLegalDocumentsBodySchema,
  generateLegalDocumentsResponseSchema,
  previewLegalDocumentsResponseSchema,
  type GenerateLegalDocumentsBody,
} from './legal-documents.schemas';
import { UuidParam } from '../uuid-param.decorator';
import type { LegalDocumentsDeps } from './legal-documents.deps';
import { LEGAL_DOCUMENTS_DEPS } from './legal-documents.tokens';
import { TenantId, UserId } from '../auth/session-identity.decorator';

/**
 * Generates draft Privacy Policy / Cookie Policy / Terms & Conditions
 * pages from a deterministic template (docs/adr/0040) — no role gate
 * beyond being logged in, since it only ever creates drafts (never
 * publishes) and injects no raw script, unlike theme-settings.
 */
@Controller('sites/:siteId/legal-documents')
@UseGuards(SessionAuthGuard)
export class LegalDocumentsController {
  constructor(
    @Inject(LEGAL_DOCUMENTS_DEPS) private readonly deps: LegalDocumentsDeps,
  ) {}

  @Post()
  async generate(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('siteId') siteId: string,
    @Body(new ZodValidationPipe(generateLegalDocumentsBodySchema))
    body: GenerateLegalDocumentsBody,
  ) {
    const result = await generateLegalDocuments(this.deps, {
      tenantId,
      siteId,
      documents: body.documents,
      locales: body.locales,
      answers: body.answers,
      createdBy: userId,
    });
    return generateLegalDocumentsResponseSchema.parse(result);
  }

  // No persistence — lets the wizard show real generated text in its
  // review step before the site owner commits to creating the drafts.
  @Post('preview')
  async preview(
    @Body(new ZodValidationPipe(generateLegalDocumentsBodySchema))
    body: GenerateLegalDocumentsBody,
  ) {
    const documents = body.documents.map((kind) => {
      const template = LEGAL_DOCUMENT_TEMPLATES[kind];
      const locales = Object.fromEntries(
        body.locales.map((locale) => {
          const templateLocale = resolveTemplateLocale(locale);
          const outline = template[templateLocale](body.answers);
          return [locale, outline];
        }),
      );
      return { kind, locales };
    });
    return previewLegalDocumentsResponseSchema.parse({ documents });
  }
}
