import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  generatePage,
  getSiteAiSettings,
  preparePageGeneration,
} from '@kometio/application';
import { PageGenerationFailedError } from '@kometio/domain-core';
import { type PageGenerationFailure } from '@kometio/shared-types';
import {
  generatePageRequestSchema,
  type GeneratePageRequest,
  type PageGenerationStatus,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantId } from '../auth/session-identity.decorator';
import { UuidParam } from '../uuid-param.decorator';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { PageGenerationDeps } from './page-generation.deps';
import {
  PageGenerationStream,
  type EventStreamResponse,
} from './page-generation-stream';
import { PAGE_GENERATION_DEPS } from './page-generation.tokens';

/**
 * Generates a page from a prompt, streamed as server-sent events (see
 * PageGenerationStream). The page is never saved here — the editor loads
 * it as a draft.
 *
 * Whatever can be refused is refused before the stream opens, as an
 * answer of its own: a site that is not the tenant's, a deployment with
 * page generation off, a site with no provider or a key that no longer
 * opens, a site already writing as many pages as it may. Only what the
 * provider does is told inside the stream.
 *
 * If the person leaves, the request to the provider is cancelled: nobody
 * pays for a page nobody will read.
 */
@Controller('sites/:id/generate-page')
@UseGuards(SessionAuthGuard)
export class GeneratePageController {
  private readonly logger = new Logger(GeneratePageController.name);

  constructor(
    @Inject(PAGE_GENERATION_DEPS) private readonly deps: PageGenerationDeps,
  ) {}

  /** Whether "Generate with AI" can work, without the settings behind it. */
  @Get()
  async status(
    @TenantId() tenantId: string,
    @UuidParam('id') siteId: string,
  ): Promise<PageGenerationStatus> {
    if (!this.deps.enabled) return { availability: 'server-disabled' };
    const settings = await getSiteAiSettings(this.deps, { tenantId, siteId });
    return { availability: settings.configured ? 'ready' : 'not-configured' };
  }

  /**
   * A generation spends the site owner's money: ten a minute is plenty for
   * a person, and a wall against a script.
   */
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generate(
    @TenantId() tenantId: string,
    @UuidParam('id') siteId: string,
    @Body(new ZodValidationPipe(generatePageRequestSchema))
    body: GeneratePageRequest,
    @Res() response: EventStreamResponse,
  ): Promise<void> {
    const deps = this.deps.requireEnabled();
    const prepared = await preparePageGeneration(deps, { tenantId, siteId });
    const release = this.deps.slots.take(siteId);
    if (!release) throw new PageGenerationFailedError('busy');

    const stream = new PageGenerationStream(response);
    // Leaving, finishing or running out of time: the provider is stopped.
    const deadline = AbortSignal.timeout(this.deps.deadlineMs);
    try {
      const page = await generatePage(deps, prepared, {
        locale: body.locale,
        prompt: body.prompt,
        existingOutline: body.existingOutline,
        signal: AbortSignal.any([stream.left, deadline]),
        onProgress: (received) => stream.progress(received),
      });
      this.logger.log(
        `Generated ${page.content.length} blocks with ${page.model} (${page.usage.inputTokens} in, ${page.usage.cachedInputTokens} cached, ${page.usage.outputTokens} out; ${page.dropped.length} dropped).`,
      );
      stream.done(page);
    } catch (error) {
      if (stream.left.aborted) return;
      stream.failed(deadline.aborted ? 'timed-out' : this.failureOf(error));
    } finally {
      release();
    }
  }

  private failureOf(error: unknown): PageGenerationFailure {
    if (error instanceof PageGenerationFailedError) return error.failure;
    // Not something the person can fix: logged, reported as unreachable.
    this.logger.error(error);
    return 'unreachable';
  }
}
