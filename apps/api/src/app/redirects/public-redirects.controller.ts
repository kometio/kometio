import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { resolveRedirect } from '@kometio/application';
import {
  type PublicRedirectAnswer,
  type PublicRedirectQuery,
  publicRedirectAnswerSchema,
  publicRedirectQuerySchema,
} from '@kometio/api-contracts';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { PublicRedirectsDeps } from './redirects.deps';
import { PUBLIC_REDIRECTS_DEPS } from './redirects.tokens';

// No SessionAuthGuard: the public site asks it on a visitor's behalf, like
// every other `public/*` route. Read-only in what it says; what it writes is
// its own counters, which are batched and which no caller can read back.
@Controller('public/redirects')
@UseGuards(PublicPagesThrottlerGuard)
export class PublicRedirectsController {
  constructor(
    @Inject(PUBLIC_REDIRECTS_DEPS) private readonly deps: PublicRedirectsDeps,
  ) {}

  /**
   * What to answer a visitor who asked for an address the public site's
   * routes did not have (docs/adr/0127). Asked by the site only after its
   * own lookups have come back empty, so a page always wins over a rule.
   *
   * A 404 is "no rule for it", like the other lookups' 404: the site goes on
   * to its own not-found page.
   */
  @Get('resolve')
  async resolve(
    @Query(new ZodValidationPipe(publicRedirectQuerySchema))
    query: PublicRedirectQuery,
  ): Promise<PublicRedirectAnswer> {
    const answer = await resolveRedirect(this.deps, {
      tenantId: await this.deps.tenant.require(),
      domain: query.domain,
      pathname: query.path,
      search: query.search,
    });
    if (!answer) {
      throw new NotFoundException('No redirect for this address');
    }
    return publicRedirectAnswerSchema.parse(answer);
  }
}
