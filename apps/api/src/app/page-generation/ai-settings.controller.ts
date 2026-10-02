import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  getSiteAiSettings,
  removeSiteAiSettings,
  updateSiteAiSettings,
} from '@kometio/application';
import {
  siteAiSettingsInputSchema,
  type SiteAiSettingsInput,
  type SiteAiSettingsResponse,
  type SiteAiSettingsView,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { TenantId } from '../auth/session-identity.decorator';
import { UuidParam } from '../uuid-param.decorator';
import { ZodValidationPipe } from '../zod-validation.pipe';
import type { PageGenerationDeps } from './page-generation.deps';
import { PAGE_GENERATION_DEPS } from './page-generation.tokens';
import { RequiresPermission } from '../auth/allowed.decorator';
import { RolesGuard } from '../auth/roles.guard';

/**
 * How a site generates pages from a prompt: admins only, since the key is
 * spent on their account and the provider sees what they generate. The
 * key goes in and never comes back out — the view carries its last four
 * characters.
 */
@Controller('sites/:id/ai-settings')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class AiSettingsController {
  constructor(
    @Inject(PAGE_GENERATION_DEPS) private readonly deps: PageGenerationDeps,
  ) {}

  @Get()
  async get(
    @TenantId() tenantId: string,
    @UuidParam('id') siteId: string,
  ): Promise<SiteAiSettingsResponse> {
    const view = await getSiteAiSettings(this.deps, { tenantId, siteId });
    return { ...view, enabled: this.deps.enabled };
  }

  @Put()
  async update(
    @TenantId() tenantId: string,
    @UuidParam('id') siteId: string,
    @Body(new ZodValidationPipe(siteAiSettingsInputSchema))
    settings: SiteAiSettingsInput,
  ): Promise<SiteAiSettingsView> {
    return updateSiteAiSettings(this.deps.requireEnabled(), {
      tenantId,
      siteId,
      settings,
    });
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @TenantId() tenantId: string,
    @UuidParam('id') siteId: string,
  ): Promise<void> {
    await removeSiteAiSettings(this.deps, { tenantId, siteId });
  }
}
