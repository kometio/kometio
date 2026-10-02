import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  getOrCreateSiteLayoutSection,
  getSiteLayoutSection,
  listSiteLayoutSectionVersions,
  publishSiteLayoutSection,
  rollbackSiteLayoutSectionToVersion,
  saveSiteLayoutSectionDraft,
  updateSiteLayoutSectionSticky,
} from '@kometio/application';
import type { SiteLayoutSection } from '@kometio/domain-core';
import {
  type SiteLayoutSectionRecord,
  type SiteLayoutSectionVersionRecord,
  siteLayoutSectionRecordSchema,
  siteLayoutSectionVersionRecordSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type GetOrCreateQuery,
  getOrCreateQuerySchema,
  type RollbackBody,
  rollbackBodySchema,
  type SaveDraftBody,
  saveDraftBodySchema,
  type StickyBody,
  stickyBodySchema,
} from './site-layout-sections.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { SiteLayoutSectionsDeps } from './site-layout-sections.deps';
import { SITE_LAYOUT_SECTIONS_DEPS } from './site-layout-sections.tokens';
import { TenantId } from '../auth/session-identity.decorator';

@Controller('site-layout-sections')
@UseGuards(SessionAuthGuard)
export class SiteLayoutSectionsController {
  constructor(
    @Inject(SITE_LAYOUT_SECTIONS_DEPS)
    private readonly deps: SiteLayoutSectionsDeps,
  ) {}

  @Get()
  async getOrCreate(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(getOrCreateQuerySchema))
    query: GetOrCreateQuery,
  ) {
    const section = await getOrCreateSiteLayoutSection(this.deps, {
      tenantId,
      siteId: query.siteId,
      locale: query.locale,
      kind: query.kind,
    });
    return this.toDto(section);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    return this.toDto(
      await getSiteLayoutSection(this.deps, { tenantId, sectionId: id }),
    );
  }

  @Patch(':id/draft')
  async saveDraft(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(saveDraftBodySchema)) body: SaveDraftBody,
  ) {
    const section = await saveSiteLayoutSectionDraft(
      {
        siteLayoutSectionRepository: this.deps.siteLayoutSectionRepository,
        siteLayoutSectionVersionRepository:
          this.deps.siteLayoutSectionVersionRepository,
      },
      {
        tenantId,
        id,
        content: body.content,
        actorUserId: null,
      },
    );
    return this.toDto(section);
  }

  @Post(':id/publish')
  @Allowed('changeLiveSite')
  async publish(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    const section = await publishSiteLayoutSection(this.deps, { tenantId, id });
    return this.toDto(section);
  }

  @Patch(':id/sticky')
  @Allowed('changeLiveSite')
  async updateSticky(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(stickyBodySchema)) body: StickyBody,
  ) {
    const section = await updateSiteLayoutSectionSticky(this.deps, {
      tenantId,
      id,
      sticky: body.sticky,
    });
    return this.toDto(section);
  }

  @Get(':id/versions')
  async listVersions(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<SiteLayoutSectionVersionRecord[]> {
    const versions = await listSiteLayoutSectionVersions(
      {
        siteLayoutSectionVersionRepository:
          this.deps.siteLayoutSectionVersionRepository,
      },
      { tenantId, id },
    );
    return versions.map((version) =>
      siteLayoutSectionVersionRecordSchema.parse({
        id: version.id,
        tenantId: version.tenantId,
        siteLayoutSectionId: version.siteLayoutSectionId,
        content: version.content,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString(),
      }),
    );
  }

  @Post(':id/rollback')
  async rollback(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(rollbackBodySchema)) body: RollbackBody,
  ) {
    const section = await rollbackSiteLayoutSectionToVersion(
      {
        siteLayoutSectionRepository: this.deps.siteLayoutSectionRepository,
        siteLayoutSectionVersionRepository:
          this.deps.siteLayoutSectionVersionRepository,
      },
      {
        tenantId,
        id,
        versionId: body.versionId,
        actorUserId: null,
      },
    );
    return this.toDto(section);
  }

  /** Whitelisted field by field, never the entity's props spread: a field `SiteLayoutSection` gains later does not leave the server until somebody decides it should. */
  private toDto(section: SiteLayoutSection): SiteLayoutSectionRecord {
    const props = section.toProps();
    return siteLayoutSectionRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      locale: props.locale,
      kind: props.kind,
      status: props.status,
      content: props.content,
      publishedContent: props.publishedContent,
      sticky: props.sticky,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }
}
