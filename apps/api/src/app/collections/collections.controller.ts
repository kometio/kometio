import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from '@kometio/application';
import type { Collection } from '@kometio/domain-core';
import { collectionRecordSchema } from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  createCollectionBodySchema,
  listCollectionsQuerySchema,
  updateCollectionBodySchema,
  type CreateCollectionBody,
  type ListCollectionsQuery,
  type UpdateCollectionBody,
} from './collections.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { CollectionsDeps } from './collections.deps';
import { COLLECTIONS_DEPS } from './collections.tokens';
import { TenantId } from '../auth/session-identity.decorator';

/**
 * The editor's own sections — News, Events, Case studies.
 *
 * A collection holds no content: the pages it lists are read through
 * `GET /page-groups?collection=<id>`, which is the same list the Pages
 * screen asks for with a different answer to the same question.
 */
@Controller('collections')
@UseGuards(SessionAuthGuard)
export class CollectionsController {
  constructor(
    @Inject(COLLECTIONS_DEPS) private readonly deps: CollectionsDeps,
  ) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listCollectionsQuerySchema))
    query: ListCollectionsQuery,
  ) {
    const collections = await listCollections(
      this.deps,
      tenantId,
      query.siteId,
    );
    return collections.map((collection) => this.toDto(collection));
  }

  @Post()
  @Allowed('changeLiveSite')
  async create(
    @TenantId() tenantId: string,
    @Body(new ZodValidationPipe(createCollectionBodySchema))
    body: CreateCollectionBody,
  ) {
    const collection = await createCollection(this.deps, {
      tenantId,
      siteId: body.siteId,
      name: body.name,
      icon: body.icon,
    });
    return this.toDto(collection);
  }

  @Patch(':id')
  @Allowed('changeLiveSite')
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateCollectionBodySchema))
    body: UpdateCollectionBody,
  ) {
    const collection = await updateCollection(this.deps, {
      tenantId,
      collectionId: id,
      name: body.name,
      icon: body.icon,
      defaultTemplateId: body.defaultTemplateId,
    });
    return this.toDto(collection);
  }

  @Delete(':id')
  @Allowed('delete')
  @HttpCode(204)
  async remove(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    await deleteCollection(this.deps, tenantId, id);
  }

  /** Whitelisted field by field, never the raw entity — the same discipline as every other controller here. */
  private toDto(collection: Collection) {
    const props = collection.toProps();
    return collectionRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      name: props.name,
      icon: props.icon,
      order: props.order,
      defaultTemplateId: props.defaultTemplateId,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }
}
