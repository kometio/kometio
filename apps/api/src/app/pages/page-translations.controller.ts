import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  createPagePreviewToken,
  createPageGroupTranslation,
  divergePageTranslation,
  listPageGroupTranslations,
  listPageTranslationVersions,
  publishPageTranslation,
  relinkPageTranslation,
  rollbackPageTranslationToVersion,
  saveDivergedPageTranslationContent,
  savePageTranslationFieldValues,
  renamePageTranslation,
  updatePageTranslationSeoMeta,
} from '@kometio/application';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type CreatePageGroupTranslationBody,
  createPageGroupTranslationBodySchema,
  type RelinkPageTranslationBody,
  relinkPageTranslationBodySchema,
  type RollbackToVersionBody,
  rollbackToVersionBodySchema,
  type SaveDivergedPageTranslationContentBody,
  saveDivergedPageTranslationContentBodySchema,
  type SavePageTranslationFieldValuesBody,
  savePageTranslationFieldValuesBodySchema,
  type RenamePageTranslationBody,
  type UpdatePageTranslationSeoMetaBody,
  renamePageTranslationBodySchema,
  updatePageTranslationSeoMetaBodySchema,
} from './page-groups.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { PagesDeps } from './pages.deps';
import { PAGES_DEPS } from './pages.tokens';
import { TenantId, UserId } from '../auth/session-identity.decorator';
import { PageRecords } from './page-records';

/**
 * The text of a page, per language (docs/adr/0034): its translations, the
 * per-locale field values, the address and SEO, publishing, unlinking and
 * relinking from the shared structure, previews and versions. Every route
 * is under `page-groups`, since a translation belongs to a group.
 */
@Controller('page-groups')
@UseGuards(SessionAuthGuard)
export class PageTranslationsController {
  constructor(
    @Inject(PAGES_DEPS) private readonly deps: PagesDeps,
    private readonly records: PageRecords,
  ) {}

  @Get(':id/translations')
  async listTranslations(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ) {
    const translations = await listPageGroupTranslations(this.deps, {
      tenantId,
      pageGroupId: id,
    });
    return translations.map((translation) =>
      this.records.toTranslation(translation),
    );
  }

  @Post(':id/translations')
  async createTranslation(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(createPageGroupTranslationBodySchema))
    body: CreatePageGroupTranslationBody,
  ) {
    const translation = await createPageGroupTranslation(this.deps, {
      ...body,
      pageGroupId: id,
      tenantId,
      createdBy: userId,
    });
    return this.records.toTranslation(translation);
  }

  @Patch('translations/:translationId/field-values')
  async saveFieldValues(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(savePageTranslationFieldValuesBodySchema))
    body: SavePageTranslationFieldValuesBody,
  ) {
    const translation = await savePageTranslationFieldValues(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      fieldValues: body.fieldValues,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  @Patch('translations/:translationId/diverged-content')
  async saveDivergedContent(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(saveDivergedPageTranslationContentBodySchema))
    body: SaveDivergedPageTranslationContentBody,
  ) {
    const translation = await saveDivergedPageTranslationContent(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      content: body.content,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  @Patch('translations/:translationId/seo')
  @Allowed('changeLiveSite')
  async updateSeo(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(updatePageTranslationSeoMetaBodySchema))
    body: UpdatePageTranslationSeoMetaBody,
  ) {
    const translation = await updatePageTranslationSeoMeta(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      seoMeta: body.seoMeta,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  /**
   * Moves this language's page to a new address.
   *
   * Not part of the SEO patch above even though both edit one
   * translation: changing a meta description is a correction, changing an
   * address is a move — it retires a URL, leaves a 301 behind it, and can
   * be refused because a sibling already answers there. Folding it into
   * `seo` would have made all of that invisible at the call site.
   */
  @Patch('translations/:translationId/slug')
  @Allowed('changeLiveSite')
  async rename(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(renamePageTranslationBodySchema))
    body: RenamePageTranslationBody,
  ) {
    const translation = await renamePageTranslation(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      slug: body.slug,
      parentGroupId: body.parentGroupId,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  // Only admin/publisher can publish, draft/save stays open to every
  // logged-in role.
  @Post('translations/:translationId/publish')
  @Allowed('changeLiveSite')
  async publish(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
  ) {
    const translation = await publishPageTranslation(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  @Post('translations/:translationId/diverge')
  async diverge(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
  ) {
    const translation = await divergePageTranslation(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  /**
   * Brings an unlinked language back onto the shared structure, with the
   * text the editor carried over from its fork (docs/adr/0075).
   */
  @Post('translations/:translationId/relink')
  async relink(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(relinkPageTranslationBodySchema))
    body: RelinkPageTranslationBody,
  ) {
    const translation = await relinkPageTranslation(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      fieldValues: body.fieldValues,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  @Patch('translations/:translationId/rollback')
  async rollbackTranslation(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('translationId') translationId: string,
    @Body(new ZodValidationPipe(rollbackToVersionBodySchema))
    body: RollbackToVersionBody,
  ) {
    const translation = await rollbackPageTranslationToVersion(this.deps, {
      tenantId,
      pageTranslationId: translationId,
      versionId: body.versionId,
      actorUserId: userId,
    });
    return this.records.toTranslation(translation);
  }

  // Same gate as PagesController.createPreviewToken: every role that can
  // save a draft can also preview it, not just admin/publisher.
  @Post('translations/:translationId/preview-token')
  async createPreviewToken(
    @TenantId() tenantId: string,
    @UuidParam('translationId') translationId: string,
  ) {
    const { token, expiresAt } = await createPagePreviewToken(this.deps, {
      tenantId,
      pageTranslationId: translationId,
    });
    return { token, expiresAt };
  }

  @Get('translations/:translationId/versions')
  async listTranslationVersions(
    @TenantId() tenantId: string,
    @UuidParam('translationId') translationId: string,
  ) {
    const versions = await listPageTranslationVersions(this.deps, {
      tenantId,
      pageTranslationId: translationId,
    });
    return versions.map((version) =>
      this.records.toTranslationVersion(version),
    );
  }
}
