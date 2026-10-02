import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createPage,
  createPageGroup,
  deletePageGroup,
  duplicatePageGroup,
  getPageGroupById,
  listPageGroups,
  movePageGroupToCollection,
  movePageGroupToParent,
  listPageGroupTerms,
  listPageGroupVersions,
  reorderSiblingPageGroups,
  rollbackPageGroupToVersion,
  savePageGroupAsTemplate,
  savePageGroupContent,
  setPageGroupTerms,
} from '@kometio/application';
import {
  pageGroupTermsSchema,
  paginatedPageGroupsSchema,
  type PageGroupTerms,
  type ReusableSectionRecord,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ReusableSectionRecords } from '../reusable-sections/reusable-section-records';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  pageGroupTermsBodySchema,
  type PageGroupTermsBody,
} from '../taxonomies/taxonomies.schemas';
import {
  type CreatePageGroupBody,
  createPageGroupBodySchema,
  type SaveAsTemplateBody,
  saveAsTemplateBodySchema,
  type ListPageGroupsQuery,
  type MoveToCollectionBody,
  type MoveToParentBody,
  listPageGroupsQuerySchema,
  moveToCollectionBodySchema,
  moveToParentBodySchema,
  type ReorderPageGroupsBody,
  reorderPageGroupsBodySchema,
  type RollbackToVersionBody,
  rollbackToVersionBodySchema,
  type SavePageGroupContentBody,
  savePageGroupContentBodySchema,
} from './page-groups.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { PagesDeps } from './pages.deps';
import { PAGES_DEPS } from './pages.tokens';
import { TenantId, UserId } from '../auth/session-identity.decorator';
import { PageRecords } from './page-records';

/**
 * Field-level i18n (docs/adr/0034): shared structure (`PageGroup`) plus
 * per-locale text (`PageTranslation`). This controller is the structure —
 * the page, its content, where it sits and what it is filed under; the
 * text per language is PageTranslationsController.
 */
@Controller('page-groups')
@UseGuards(SessionAuthGuard)
export class PageGroupsController {
  constructor(
    @Inject(PAGES_DEPS) private readonly deps: PagesDeps,
    private readonly records: PageRecords,
    private readonly sectionRecords: ReusableSectionRecords,
  ) {}

  @Post()
  async create(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(createPageGroupBodySchema))
    body: CreatePageGroupBody,
  ) {
    const { translation, templateId, ...rest } = body;
    const input = {
      ...rest,
      createdBy: userId,
      tenantId,
    };
    // With its first language, the page is written in one transaction —
    // what the editor always sends (docs/adr/0072). Without it, the group
    // alone, as the API has always allowed.
    const group = translation
      ? (await createPage(this.deps, { ...input, ...translation, templateId }))
          .group
      : await createPageGroup(this.deps, input);
    return this.records.toGroup(group);
  }

  /**
   * "Save as template": a published template holding what this page shows
   * in the site's default language (docs/adr/0072). Answered with the
   * template in the same shape `GET /reusable-sections/:id` returns, since
   * that is the list the editor refreshes afterwards.
   */
  @Post(':id/save-as-template')
  async saveAsTemplate(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(saveAsTemplateBodySchema))
    body: SaveAsTemplateBody,
  ): Promise<ReusableSectionRecord> {
    const template = await savePageGroupAsTemplate(this.deps, {
      tenantId,
      pageGroupId: id,
      name: body.name,
      actorUserId: userId,
    });
    return this.sectionRecords.toRecord(template);
  }

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listPageGroupsQuerySchema))
    query: ListPageGroupsQuery,
  ) {
    const result = await listPageGroups(this.deps, {
      tenantId,
      siteId: query.siteId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      filters: {
        search: query.search,
        createdAfter: query.createdAfter,
        createdBefore: query.createdBefore,
        createdBy: query.createdBy,
        locale: query.locale,
        excludeSubtreeOf: query.excludeSubtreeOf,
        ...(query.collection === undefined
          ? {}
          : {
              collectionId:
                query.collection === 'none' ? null : query.collection,
            }),
      },
    });
    return paginatedPageGroupsSchema.parse({
      total: result.total,
      items: result.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        lastEditedAt: item.lastEditedAt.toISOString(),
      })),
    });
  }

  @Patch('reorder')
  @Allowed('changeLiveSite')
  @HttpCode(204)
  async reorder(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(reorderPageGroupsBodySchema))
    body: ReorderPageGroupsBody,
  ): Promise<void> {
    await reorderSiblingPageGroups(this.deps, {
      tenantId,
      siteId: body.siteId,
      parentId: body.parentId,
      orderedPageGroupIds: body.orderedPageGroupIds,
      actorUserId: userId,
    });
  }

  @Post(':id/duplicate')
  async duplicate(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
  ) {
    const result = await duplicatePageGroup(this.deps, {
      tenantId,
      sourceGroupId: id,
      createdBy: userId,
    });
    return this.records.toGroup(result.group);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    const group = await getPageGroupById(this.deps, {
      tenantId,
      pageGroupId: id,
    });
    return this.records.toGroup(group);
  }

  @Patch(':id/content')
  async saveContent(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(savePageGroupContentBodySchema))
    body: SavePageGroupContentBody,
  ) {
    const group = await savePageGroupContent(this.deps, {
      tenantId,
      pageGroupId: id,
      content: body.content,
      actorUserId: userId,
    });
    return this.records.toGroup(group);
  }

  @Patch(':id/rollback')
  async rollback(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(rollbackToVersionBodySchema))
    body: RollbackToVersionBody,
  ) {
    const group = await rollbackPageGroupToVersion(this.deps, {
      tenantId,
      pageGroupId: id,
      versionId: body.versionId,
      actorUserId: userId,
    });
    return this.records.toGroup(group);
  }

  @Delete(':id')
  @Allowed('delete')
  @HttpCode(204)
  async delete(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    await deletePageGroup(this.deps, {
      tenantId,
      pageGroupId: id,
      actorUserId: userId,
    });
  }

  @Get(':id/versions')
  async listVersions(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ) {
    const versions = await listPageGroupVersions(this.deps, {
      tenantId,
      pageGroupId: id,
    });
    return versions.map((version) => this.records.toGroupVersion(version));
  }

  /**
   * What this page is filed under, across every dimension at once
   * (docs/adr/0064). On the GROUP and not the translation, exactly as
   * the hierarchy is: the Italian and the English version of an article
   * are the same article.
   */
  @Get(':id/terms')
  async listTerms(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<PageGroupTerms> {
    await getPageGroupById(this.deps, { tenantId, pageGroupId: id });
    return pageGroupTermsSchema.parse({
      termIds: await listPageGroupTerms(this.deps, tenantId, id),
    });
  }

  /** The whole set, not a diff — the editor knows which boxes are ticked, not which changed. */
  @Patch(':id/terms')
  @Allowed('changeLiveSite')
  async setTerms(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(pageGroupTermsBodySchema))
    body: PageGroupTermsBody,
  ): Promise<PageGroupTerms> {
    await getPageGroupById(this.deps, { tenantId, pageGroupId: id });
    return pageGroupTermsSchema.parse({
      termIds: await setPageGroupTerms(this.deps, {
        tenantId,
        pageGroupId: id,
        termIds: body.termIds,
      }),
    });
  }

  /** Which section of the editor lists this page — not where it lives on the site. */
  @Patch(':id/collection')
  @Allowed('changeLiveSite')
  async moveToCollection(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(moveToCollectionBodySchema))
    body: MoveToCollectionBody,
  ) {
    const group = await movePageGroupToCollection(this.deps, {
      tenantId,
      pageGroupId: id,
      collectionId: body.collectionId,
      actorUserId: userId,
    });
    return this.records.toGroup(group);
  }

  /*
   * Where the page hangs in the site's tree — its address, and the
   * address of everything under it. A different thing from
   * `:id/collection`, which only decides which screen lists it.
   */
  @Patch(':id/parent')
  @Allowed('changeLiveSite')
  async moveToParent(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(moveToParentBodySchema))
    body: MoveToParentBody,
  ) {
    const group = await movePageGroupToParent(this.deps, {
      tenantId,
      pageGroupId: id,
      parentId: body.parentId,
      actorUserId: userId,
    });
    return this.records.toGroup(group);
  }
}
