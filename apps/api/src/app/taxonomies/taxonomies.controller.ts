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
  createTaxonomy,
  createTerm,
  deleteTaxonomy,
  deleteTerm,
  getTaxonomy,
  getTerm,
  listTaxonomies,
  listTerms,
  moveTerm,
  reorderSiblingTerms,
  updateTaxonomy,
  updateTerm,
} from '@kometio/application';
import type { Taxonomy, Term } from '@kometio/domain-core';
import {
  type TaxonomyRecord,
  type TermRecord,
  taxonomyRecordSchema,
  termRecordSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  createTaxonomyBodySchema,
  createTermBodySchema,
  listQuerySchema,
  moveTermBodySchema,
  reorderTermsBodySchema,
  updateTaxonomyBodySchema,
  updateTermBodySchema,
  type CreateTaxonomyBody,
  type CreateTermBody,
  type ListQuery,
  type MoveTermBody,
  type ReorderTermsBody,
  type UpdateTaxonomyBody,
  type UpdateTermBody,
} from './taxonomies.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { TaxonomiesDeps } from './taxonomies.deps';
import { TAXONOMIES_DEPS } from './taxonomies.tokens';
import { TenantId } from '../auth/session-identity.decorator';

/**
 * Dimensions and their terms (docs/adr/0064). Terms are nested under
 * their taxonomy in the URL because they have no meaning without one —
 * a term id alone would still work, and would hide that the dimension is
 * what decides the address.
 */
@Controller('taxonomies')
@UseGuards(SessionAuthGuard)
export class TaxonomiesController {
  constructor(@Inject(TAXONOMIES_DEPS) private readonly deps: TaxonomiesDeps) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    const taxonomies = await listTaxonomies(this.deps, tenantId, query.siteId);
    return taxonomies.map((taxonomy) => this.toTaxonomyDto(taxonomy));
  }

  @Post()
  @Allowed('changeLiveSite')
  async create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(createTaxonomyBodySchema))
    body: CreateTaxonomyBody,
  ) {
    const taxonomy = await createTaxonomy(this.deps, {
      tenantId,
      siteId: body.siteId,
      name: body.name,
      // `undefined` and `null` mean different things here — see the
      // schema — so the property is only passed when the client sent it.
      ...(body.prefix === undefined ? {} : { prefix: body.prefix }),
      hierarchical: body.hierarchical,
    });
    return this.toTaxonomyDto(taxonomy);
  }

  @Get(':id')
  async get(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    const taxonomy = await getTaxonomy(this.deps, tenantId, id);
    return this.toTaxonomyDto(taxonomy);
  }

  @Patch(':id')
  @Allowed('changeLiveSite')
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateTaxonomyBodySchema))
    body: UpdateTaxonomyBody,
  ) {
    const taxonomy = await updateTaxonomy(this.deps, {
      tenantId,
      id,
      name: body.name,
      ...(body.prefix === undefined ? {} : { prefix: body.prefix }),
      hierarchical: body.hierarchical,
      order: body.order,
    });
    return this.toTaxonomyDto(taxonomy);
  }

  @Delete(':id')
  @Allowed('delete')
  async remove(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    await deleteTaxonomy(this.deps, tenantId, id);
    return { ok: true };
  }

  @Get(':id/terms')
  async listTerms(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    // Through the taxonomy, so a request for the terms of a dimension
    // that does not exist is a 404 rather than an empty list — an empty
    // list is an answer about a dimension, and there is none.
    await getTaxonomy(this.deps, tenantId, id);
    const terms = await listTerms(this.deps, tenantId, id);
    return terms.map((term) => this.toTermDto(term));
  }

  @Post(':id/terms')
  @Allowed('changeLiveSite')
  async createTerm(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(createTermBodySchema)) body: CreateTermBody,
  ) {
    const term = await createTerm(this.deps, {
      tenantId,
      taxonomyId: id,
      name: body.name,
      slugs: body.slugs,
      parentId: body.parentId ?? null,
    });
    return this.toTermDto(term);
  }

  /**
   * The order of the terms that share one parent, in one call: the whole
   * sibling group, in the order wanted — what a move up or down is, and
   * what a change per term could not be without two of them briefly in
   * one place.
   */
  @Patch(':id/terms/reorder')
  @Allowed('changeLiveSite')
  async reorderTerms(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(reorderTermsBodySchema))
    body: ReorderTermsBody,
  ) {
    await reorderSiblingTerms(this.deps, {
      tenantId,
      taxonomyId: id,
      parentId: body.parentId,
      orderedTermIds: body.orderedTermIds,
    });
    const terms = await listTerms(this.deps, tenantId, id);
    return terms.map((term) => this.toTermDto(term));
  }

  @Get('terms/:termId')
  async getTerm(
    @TenantId() tenantId: string,
    @UuidParam('termId') termId: string,
  ) {
    const term = await getTerm(this.deps, tenantId, termId);
    return this.toTermDto(term);
  }

  @Patch('terms/:termId')
  @Allowed('changeLiveSite')
  async updateTerm(
    @TenantId() tenantId: string,
    @UuidParam('termId') termId: string,
    @Body(new ZodValidationPipe(updateTermBodySchema)) body: UpdateTermBody,
  ) {
    const term = await updateTerm(this.deps, {
      tenantId,
      id: termId,
      name: body.name,
      description: body.description,
      seoMeta: body.seoMeta,
      noindex: body.noindex,
      slugs: body.slugs,
      ...(body.landingPageGroupId === undefined
        ? {}
        : { landingPageGroupId: body.landingPageGroupId }),
      order: body.order,
    });
    return this.toTermDto(term);
  }

  @Patch('terms/:termId/parent')
  @Allowed('changeLiveSite')
  async moveTerm(
    @TenantId() tenantId: string,
    @UuidParam('termId') termId: string,
    @Body(new ZodValidationPipe(moveTermBodySchema)) body: MoveTermBody,
  ) {
    const term = await moveTerm(this.deps, {
      tenantId,
      id: termId,
      parentId: body.parentId,
    });
    return this.toTermDto(term);
  }

  @Delete('terms/:termId')
  @Allowed('delete')
  async removeTerm(
    @TenantId() tenantId: string,
    @UuidParam('termId') termId: string,
  ) {
    await deleteTerm(this.deps, tenantId, termId);
    return { ok: true };
  }

  /** Whitelisted field by field, never the entity's props spread — same reasoning as every other controller here. */
  private toTaxonomyDto(taxonomy: Taxonomy): TaxonomyRecord {
    const props = taxonomy.toProps();
    return taxonomyRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      prefix: props.prefix,
      name: props.name,
      hierarchical: props.hierarchical,
      order: props.order,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }

  private toTermDto(term: Term): TermRecord {
    const props = term.toProps();
    return termRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      taxonomyId: props.taxonomyId,
      parentId: props.parentId,
      name: props.name,
      description: props.description,
      seoMeta: props.seoMeta,
      noindex: props.noindex,
      landingPageGroupId: props.landingPageGroupId,
      order: props.order,
      slugs: props.slugs,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }
}
