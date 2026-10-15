import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { applyStarter, getStarterOffer } from '@kometio/application';
import {
  applyStarterBodySchema,
  applyStarterResponseSchema,
  starterOfferSchema,
  type ApplyStarterBody,
  type ApplyStarterResponse,
  type StarterOffer,
} from '@kometio/api-contracts';
import { Allowed } from '../auth/allowed.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantId, UserId } from '../auth/session-identity.decorator';
import { UuidParam } from '../uuid-param.decorator';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { StartersDeps } from './starters.deps';
import { STARTERS_DEPS } from './starters.tokens';

/**
 * The starting points of a new site (docs/adr/0136). Both routes are the
 * administrator's: a starter publishes pages, a form, a header and a footer,
 * and in a demo that is the owner's alone to do — the guard that keeps a
 * visitor out of the site's settings keeps them out of this too.
 */
@Controller('sites/:siteId/starters')
@UseGuards(SessionAuthGuard)
export class StartersController {
  constructor(@Inject(STARTERS_DEPS) private readonly deps: StartersDeps) {}

  /** Whether the site can still be given one, and in what language: what the screen after the wizard reads. */
  @Get()
  @Allowed('configureSite')
  async offer(
    @TenantId() tenantId: string,
    @UuidParam('siteId') siteId: string,
  ): Promise<StarterOffer> {
    const offer = await getStarterOffer(this.deps, { tenantId, siteId });
    return starterOfferSchema.parse(offer);
  }

  @Post()
  @Allowed('configureSite')
  async apply(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('siteId') siteId: string,
    @Body(new ZodValidationPipe(applyStarterBodySchema))
    body: ApplyStarterBody,
  ): Promise<ApplyStarterResponse> {
    const result = await applyStarter(this.deps, {
      tenantId,
      siteId,
      starterId: body.starterId,
      actorUserId: userId,
    });
    return applyStarterResponseSchema.parse(result);
  }
}
