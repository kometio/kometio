import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import {
  getImportJob,
  listImportJobs,
  runWordPressAnalysis,
  startWordPressAnalysis,
} from '@kometio/application';
import {
  type ImportJobList,
  type ImportJobRecord,
  importJobListSchema,
  importJobRecordSchema,
} from '@kometio/api-contracts';
import type { ImportJob } from '@kometio/domain-core';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type ListImportJobsQuery,
  listImportJobsQuerySchema,
  type StartWordPressAnalysisBody,
  startWordPressAnalysisBodySchema,
} from './imports.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { ImportsDeps } from './imports.deps';
import { IMPORTS_DEPS } from './imports.tokens';
import { TenantId } from '../auth/session-identity.decorator';

/**
 * 512 MB.
 *
 * The plan said 200; the first real client site exports **314 MB** — an
 * ordinary WooCommerce shop, not an outlier — and would have been turned
 * away at the door. Nothing here loads the file, so the ceiling is about
 * disk and patience rather than memory: the reader streams it in 28 MB
 * of heap whatever its size.
 */
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;

/** Where an upload lands until it has been read. Chosen here, so the paths below are this file's own. */
const UPLOAD_DIRECTORY = tmpdir();

function toDto(job: ImportJob): ImportJobRecord {
  const props = job.toProps();
  return importJobRecordSchema.parse({
    id: props.id,
    siteId: props.siteId,
    source: props.source,
    fileName: props.fileName,
    fileBytes: props.fileBytes,
    status: props.status,
    report: props.report,
    failureReason: props.failureReason,
    createdAt: props.createdAt.toISOString(),
    finishedAt: props.finishedAt?.toISOString() ?? null,
  });
}

@Controller('imports')
@UseGuards(SessionAuthGuard)
export class ImportsController {
  constructor(@Inject(IMPORTS_DEPS) private readonly deps: ImportsDeps) {}

  /**
   * Takes an export and answers with the job that will read it — 202,
   * because reading 314 MB takes seconds and because the answer is meant
   * to be read and thought about, not returned.
   */
  @Post('wordpress/analysis')
  @Allowed('configureSite')
  @UseGuards(ThrottlerGuard)
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      // On disk, not in memory: `memoryStorage` would hold the whole
      // export as a Buffer, which is the one thing the streaming reader
      // exists to avoid.
      //
      // The name is ours, not the uploader's. Multer happens to generate
      // a random one when asked for nothing, but that is an undocumented
      // default of somebody else's library — and what this handler does
      // with the path is read it and then `unlink` it, so the day that
      // default changes to keep the original name is the day an upload
      // called `../../etc/something` deletes it.
      storage: diskStorage({
        destination: UPLOAD_DIRECTORY,
        filename: (_request, _file, done) =>
          done(null, `kometio-import-${randomUUID()}.xml`),
      }),
      limits: { fileSize: MAX_EXPORT_BYTES },
    }),
  )
  async analyzeWordPress(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    // Validated inside the handler rather than by `ZodValidationPipe`,
    // which is what every other endpoint here uses. Multer has already
    // written the upload to disk by the time a pipe runs, so a body this
    // handler never sees is an upload nobody ever deletes — up to 512 MB
    // of it, on every attempt. Anything that refuses the request has to
    // do it from in here, where the file can be cleaned up.
    @Body() rawBody: unknown,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Built from the directory this controller chose and the bare name
    // multer wrote, never from `file.path` as handed over: `basename`
    // drops any directory part, and the join anchors what is left inside
    // the upload directory. Belt and braces over the `filename` callback
    // above, and the part a reader can check without leaving this file.
    const filePath = join(UPLOAD_DIRECTORY, basename(file.filename));

    let job: ImportJob;
    try {
      const body = this.readBody(rawBody);
      job = await startWordPressAnalysis(this.deps, {
        tenantId,
        siteId: body.siteId,
        filePath,
        fileName: file.originalname,
        fileBytes: file.size,
        createdBy: null,
      });
    } catch (error) {
      // Nothing has taken responsibility for the upload, so it goes now.
      // Without this, every refused request leaves its file behind and
      // the way to fill a disk is to keep uploading to a site you do not
      // own.
      await unlink(filePath).catch(() => undefined);
      throw error;
    }

    // Detached on purpose (docs/adr/0082): in-process, no queue, the
    // editor polls `GET /imports/:id`. `void` and not `await` is the
    // whole point — and the file is deleted whichever way it goes,
    // because it is not kept and a temp directory is not a store.
    void runWordPressAnalysis(this.deps, {
      tenantId,
      jobId: job.id,
      filePath,
    }).finally(() => unlink(filePath).catch(() => undefined));

    return toDto(job);
  }

  @Get(':id')
  async findById(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
  ): Promise<ImportJobRecord> {
    const job = await getImportJob(this.deps, { tenantId, jobId: id });
    return toDto(job);
  }

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listImportJobsQuerySchema))
    query: ListImportJobsQuery,
  ): Promise<ImportJobList> {
    const jobs = await listImportJobs(this.deps, {
      tenantId,
      siteId: query.siteId,
    });
    return importJobListSchema.parse({ items: jobs.map(toDto) });
  }

  /** Same shape of refusal `ZodValidationPipe` would have produced, from where the file can still be deleted. */
  private readBody(rawBody: unknown): StartWordPressAnalysisBody {
    const parsed = startWordPressAnalysisBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return parsed.data;
  }
}
