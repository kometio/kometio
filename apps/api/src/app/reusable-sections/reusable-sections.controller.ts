import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createReusableSection,
  createSectionPreviewToken,
  deleteReusableSection,
  getReusableSection,
  listReusableSectionVersions,
  listReusableSectionsWithUsage,
  publishReusableSection,
  renameReusableSection,
  rollbackReusableSectionToVersion,
  saveReusableSectionDraft,
  setReusableSectionExposedFields,
} from '@kometio/application';
import {
  type ReusableSectionListItem,
  type ReusableSectionVersionRecord,
  reusableSectionListItemSchema,
} from '@kometio/api-contracts';
import { ReusableSectionRecords } from './reusable-section-records';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type CreateBody,
  createBodySchema,
  type ExposedFieldsBody,
  exposedFieldsBodySchema,
  type ListQuery,
  listQuerySchema,
  type RenameBody,
  renameBodySchema,
  type RollbackBody,
  rollbackBodySchema,
  type SaveDraftBody,
  saveDraftBodySchema,
} from './reusable-sections.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { ReusableSectionsDeps } from './reusable-sections.deps';
import { REUSABLE_SECTIONS_DEPS } from './reusable-sections.tokens';
import { TenantId } from '../auth/session-identity.decorator';

@Controller('reusable-sections')
@UseGuards(SessionAuthGuard)
export class ReusableSectionsController {
  constructor(
    @Inject(REUSABLE_SECTIONS_DEPS) private readonly deps: ReusableSectionsDeps,
    private readonly records: ReusableSectionRecords,
  ) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<ReusableSectionListItem[]> {
    const sections = await listReusableSectionsWithUsage(
      this.deps,
      tenantId,
      query.siteId,
    );
    // The count travels with the row rather than as a second endpoint: it
    // is one number the list always shows, and a separate call would mean
    // the name and the count could disagree on screen.
    return sections.map(({ section, usedOnPages, usedInTemplates }) =>
      reusableSectionListItemSchema.parse({
        ...this.records.toRecord(section),
        usedOnPages,
        usedInTemplates,
      }),
    );
  }

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(createBodySchema)) body: CreateBody,
  ) {
    const section = await createReusableSection(this.deps, {
      tenantId,
      siteId: body.siteId,
      name: body.name,
      kind: body.kind,
      content: body.content,
      actorUserId: null,
    });
    return this.records.toRecord(section);
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    const section = await getReusableSection(this.deps, tenantId, id);
    return this.records.toRecord(section);
  }

  @Post(':id/preview-token')
  async createPreviewToken(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ) {
    const { token, expiresAt } = await createSectionPreviewToken(this.deps, {
      tenantId,
      sectionId: id,
    });
    return { token, expiresAt };
  }

  @Patch(':id/draft')
  async saveDraft(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(saveDraftBodySchema)) body: SaveDraftBody,
  ) {
    const section = await saveReusableSectionDraft(this.deps, {
      tenantId,
      id,
      content: body.content,
      actorUserId: null,
    });
    return this.records.toRecord(section);
  }

  @Patch(':id/name')
  async rename(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(renameBodySchema)) body: RenameBody,
  ) {
    const section = await renameReusableSection(this.deps, {
      tenantId,
      id,
      name: body.name,
    });
    return this.records.toRecord(section);
  }

  @Patch(':id/exposed-fields')
  @Allowed('changeLiveSite')
  async setExposedFields(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(exposedFieldsBodySchema))
    body: ExposedFieldsBody,
  ) {
    const section = await setReusableSectionExposedFields(this.deps, {
      tenantId,
      id,
      exposedFields: body.exposedFields,
    });
    return this.records.toRecord(section);
  }

  @Post(':id/publish')
  @Allowed('changeLiveSite')
  async publish(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    const section = await publishReusableSection(this.deps, { tenantId, id });
    return this.records.toRecord(section);
  }

  @Delete(':id')
  @Allowed('delete')
  async remove(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    await deleteReusableSection(this.deps, tenantId, id);
    return { deleted: true };
  }

  @Get(':id/versions')
  async listVersions(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<ReusableSectionVersionRecord[]> {
    const versions = await listReusableSectionVersions(this.deps, tenantId, id);
    return versions.map((version) => this.records.toVersionRecord(version));
  }

  @Post(':id/rollback')
  async rollback(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(rollbackBodySchema)) body: RollbackBody,
  ) {
    const section = await rollbackReusableSectionToVersion(this.deps, {
      tenantId,
      id,
      versionId: body.versionId,
      actorUserId: null,
    });
    return this.records.toRecord(section);
  }
}
