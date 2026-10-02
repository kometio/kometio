import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  countMediaByKind,
  deleteMedia,
  getMedia,
  getMediaUsages,
  listMedia,
  updateMedia,
  uploadMedia,
  MAX_UPLOAD_BYTES_BY_KIND,
} from '@kometio/application';
import { type Media } from '@kometio/domain-core';
import {
  type MediaKindCounts,
  type MediaRecord,
  type MediaUsage,
  type PaginatedMedia,
  mediaKindCountsSchema,
  mediaRecordSchema,
  mediaUsageSchema,
  paginatedMediaSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type CountMediaByKindQuery,
  countMediaByKindQuerySchema,
  type ListMediaQuery,
  listMediaQuerySchema,
  type UpdateMediaBody,
  updateMediaBodySchema,
  type UploadMediaBody,
  uploadMediaBodySchema,
} from './media.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { MediaDeps } from './media.deps';
import { MEDIA_DEPS } from './media.tokens';
import { TenantId } from '../auth/session-identity.decorator';

// The ceiling multer enforces before anything has been read — it cannot
// know what the file is yet, so it is the LARGEST any kind may be
// (ADR-0054). The real per-kind limits live in uploadMedia, which sniffs
// first: an oversized photo is refused there with the number it exceeded,
// rather than here with a generic one.
const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_UPLOAD_BYTES_BY_KIND));

@Controller('media')
@UseGuards(SessionAuthGuard)
export class MediaController {
  constructor(@Inject(MEDIA_DEPS) private readonly deps: MediaDeps) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listMediaQuerySchema)) query: ListMediaQuery,
  ): Promise<PaginatedMedia> {
    const result = await listMedia(this.deps, {
      tenantId,
      siteId: query.siteId,
      page: query.page,
      pageSize: query.pageSize,
      filter: { search: query.search, kind: query.kind },
    });
    return paginatedMediaSchema.parse({
      items: result.items.map((item) => this.toDto(item)),
      total: result.total,
    });
  }

  /**
   * What the library's folders show before one is opened. Registered as a
   * literal segment, so it is never mistaken for a media id.
   */
  @Get('kinds')
  async countByKind(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(countMediaByKindQuerySchema))
    query: CountMediaByKindQuery,
  ): Promise<MediaKindCounts> {
    return mediaKindCountsSchema.parse(
      await countMediaByKind(this.deps, {
        tenantId,
        siteId: query.siteId,
      }),
    );
  }

  @Post()
  @UseGuards(ThrottlerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(uploadMediaBodySchema)) body: UploadMediaBody,
  ): Promise<MediaRecord> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const media = await uploadMedia(this.deps, {
      tenantId,
      siteId: body.siteId,
      filename: file.originalname,
      mimeType: file.mimetype,
      data: file.buffer,
    });
    return this.toDto(media);
  }

  /** One file — for a link that names it, which cannot count on the list having loaded it. */
  @Get(':id')
  async get(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<MediaRecord> {
    return this.toDto(await getMedia(this.deps, { tenantId, mediaId: id }));
  }

  /**
   * Where the file is in use: what deleting it would leave a hole in.
   * Any signed-in role may ask — the answer is what a delete dialog says.
   */
  @Get(':id/usages')
  async usages(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<MediaUsage> {
    return mediaUsageSchema.parse(
      await getMediaUsages(this.deps, { tenantId, mediaId: id }),
    );
  }

  /**
   * A file's name and alternative text. Any signed-in role: like an
   * upload it is a draft-level change — neither reaches a page that has
   * already picked the file (see updateMedia).
   */
  @Patch(':id')
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateMediaBodySchema)) body: UpdateMediaBody,
  ): Promise<MediaRecord> {
    return this.toDto(
      await updateMedia(this.deps, {
        tenantId,
        mediaId: id,
        filename: body.filename,
        alt: body.alt,
      }),
    );
  }

  @Delete(':id')
  @Allowed('delete')
  @HttpCode(204)
  async delete(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    await deleteMedia(this.deps, { tenantId, mediaId: id });
  }

  /**
   * Whitelisted field by field, never the entity spread: a spread ships
   * whatever field `Media` gains next without anybody deciding it should
   * leave the server.
   */
  private toDto(media: Media): MediaRecord {
    const props = media.toProps();
    return mediaRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      filename: props.filename,
      alt: props.alt,
      storageKey: props.storageKey,
      storageProvider: props.storageProvider,
      mimeType: props.mimeType,
      size: props.size,
      width: props.width,
      height: props.height,
      createdAt: props.createdAt.toISOString(),
      url: this.deps.mediaStorage.getUrl(props.storageKey),
    });
  }
}
