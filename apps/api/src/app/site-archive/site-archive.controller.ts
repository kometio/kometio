import { pipeline } from 'node:stream/promises';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Logger,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SiteArchiveUnavailableError } from '@kometio/domain-core';
import type { SiteArchivePort } from '@kometio/ports';
import { SITE_ARCHIVE } from '../adapters/port.tokens';
import { RequiresPermission } from '../auth/allowed.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UserId } from '../auth/session-identity.decorator';

/** The part of Express's response a download is written through. */
export interface DownloadResponse extends NodeJS.WritableStream {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
}

/**
 * The whole site in one file, for Settings → Export (docs/adr/0105): the
 * database with its accounts' password hashes, every draft and every form, and
 * the uploaded files. An administrator's, like the settings that decide who may
 * sign in: whoever can download it can read everything a site has.
 *
 * The browser asks for it by following a link, not by a script's request, so
 * that the file goes to disk as it arrives instead of being held in memory: the
 * answer starts at once and the archive follows, as long as it takes to make.
 * What can be refused is refused before it starts. A link followed from another
 * site is refused too: the session cookie travels with it, and nothing the
 * administrator did asked for a file that size.
 */
@Controller('site-archive')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class SiteArchiveController {
  private readonly logger = new Logger(SiteArchiveController.name);

  constructor(
    @Inject(SITE_ARCHIVE) private readonly archives: SiteArchivePort | null,
  ) {}

  // A dump of the whole database and a read of every upload, for something an
  // administrator does now and then: ten a minute (the module's limit) is more
  // than a person who tries again needs.
  @Get()
  @UseGuards(ThrottlerGuard)
  async download(
    @UserId() userId: string,
    @Headers('sec-fetch-site') fetchSite: string | undefined,
    @Res() response: DownloadResponse,
  ): Promise<void> {
    if (this.archives === null) throw new SiteArchiveUnavailableError();
    // The editor's link comes from the same site (its own origin, or its
    // sibling name: admin. to api.), or from nowhere at all (an address typed).
    if (fetchSite === 'cross-site') {
      throw new ForbiddenException('Cross-site request refused');
    }

    const archive = await this.archives.export();
    this.logger.log(`The site archive is being downloaded by user ${userId}`);
    response.status(200);
    response.setHeader('Content-Type', 'application/gzip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archive.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.flushHeaders();
    try {
      await pipeline(archive.content, response);
      this.logger.log(`The site archive was sent to user ${userId}`);
    } catch (error) {
      // The connection is already cut (pipeline did it), which is how the
      // browser knows the file is not whole.
      this.logger.warn(
        `The site archive was cut short for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
