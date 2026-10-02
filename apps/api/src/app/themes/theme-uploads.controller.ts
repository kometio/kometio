import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { getThemeUpload, uploadTheme } from '@kometio/application';
import type { ThemeUploadPort } from '@kometio/ports';
import type { ThemeUploadStatus } from '@kometio/shared-types';
import { THEME_ARCHIVE_LIMITS } from '@kometio/theme-archive';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UuidParam } from '../uuid-param.decorator';
import { RequiresPermission } from '../auth/allowed.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { ThemesDeps } from './themes.deps';
import { THEMES_DEPS } from './themes.tokens';

/** Where an upload lands until it is queued. Chosen here, so the paths below are this file's own. */
const UPLOAD_DIRECTORY = tmpdir();

/**
 * Themes uploaded from the editor (docs/adr/0091). Admins only, every
 * route: a theme's components run on the server that renders the site, so
 * uploading one is running code there — which is why it is an admin's
 * decision, and why a deployment can turn it off.
 */
@Controller('themes/uploads')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class ThemeUploadsController {
  constructor(@Inject(THEMES_DEPS) private readonly deps: ThemesDeps) {}

  /** Whether the editor should offer an upload at all. */
  @Get('settings')
  settings(): { enabled: boolean } {
    return { enabled: this.deps.themeUploads !== null };
  }

  /**
   * Takes a zip and answers with the queued upload — 202: the build takes
   * a minute or two, and the editor polls `GET /themes/uploads/:id`.
   */
  @Post()
  @HttpCode(202)
  // A deliberate, rare action; a loop of them only fills the volume.
  @UseGuards(ThrottlerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      // The name is ours, never the uploader's — see ImportsController.
      storage: diskStorage({
        destination: UPLOAD_DIRECTORY,
        filename: (_request, _file, done) =>
          done(null, `kometio-theme-${randomUUID()}.zip`),
      }),
      // Too big is refused by multer before it reaches the disk, as a 413.
      limits: { fileSize: THEME_ARCHIVE_LIMITS.archiveBytes, files: 1 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ThemeUploadStatus> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const archivePath = join(UPLOAD_DIRECTORY, basename(file.filename));
    try {
      return await uploadTheme(
        { themeUploads: this.enabled(), themeCatalog: this.deps.themeCatalog },
        { archivePath },
      );
    } catch (error) {
      // Nothing has taken the file over (a queued one has been moved), so
      // it goes now, or every refused upload stays in the temp directory.
      await unlink(archivePath).catch(() => undefined);
      throw error;
    }
  }

  @Get(':id')
  status(@UuidParam('id') id: string): Promise<ThemeUploadStatus> {
    return getThemeUpload({ themeUploads: this.enabled() }, { id });
  }

  private enabled(): ThemeUploadPort {
    if (!this.deps.themeUploads) {
      throw new NotFoundException('Theme uploads are off in this deployment.');
    }
    return this.deps.themeUploads;
  }
}
