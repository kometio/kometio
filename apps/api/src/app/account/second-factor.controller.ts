import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  beginSecondFactorEnrolment,
  confirmSecondFactorEnrolment,
  disableSecondFactor,
  getSecondFactorStatus,
  regenerateRecoveryCodes,
  SECOND_FACTOR_ISSUER_FALLBACK,
} from '@kometio/application';
import {
  type ConfirmSecondFactorBody,
  confirmSecondFactorBodySchema,
  type PasswordConfirmationBody,
  passwordConfirmationBodySchema,
  type RecoveryCodes,
  recoveryCodesSchema,
  type SecondFactorEnrolment,
  secondFactorEnrolmentSchema,
  type SecondFactorStatus,
  secondFactorStatusSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PerUserThrottlerGuard } from '../auth/per-user-throttler.guard';
import {
  SessionToken,
  TenantId,
  UserId,
} from '../auth/session-identity.decorator';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AuditRecorder } from '../audit/audit-recorder';
import {
  DEPLOYMENT_SITE_RESOLVER,
  type DeploymentSiteResolver,
} from '../sites/deployment-site.resolver';
import type { SecondFactorDeps } from './second-factor.deps';
import { SECOND_FACTOR_DEPS } from './second-factor.tokens';

/**
 * The signed-in person's own second step of sign-in (docs/adr/0137).
 *
 * Every role reaches it, as every role is a person; nothing here takes a user
 * id, so the only account it can touch is the one the session belongs to.
 * What begins, replaces or removes a way in asks for the password again, and
 * is counted per person like the other routes that do. The answers that hold
 * a secret or recovery codes are never cached.
 */
@Controller('account/second-factor')
@UseGuards(SessionAuthGuard)
export class SecondFactorController {
  constructor(
    @Inject(SECOND_FACTOR_DEPS) private readonly deps: SecondFactorDeps,
    @Inject(DEPLOYMENT_SITE_RESOLVER)
    private readonly site: DeploymentSiteResolver,
    private readonly audit: AuditRecorder,
  ) {}

  @Get()
  async status(
    @TenantId() tenantId: string,
    @UserId() userId: string,
  ): Promise<SecondFactorStatus> {
    return secondFactorStatusSchema.parse(
      await getSecondFactorStatus(this.deps, { tenantId, userId }),
    );
  }

  /** Makes a secret and shows it, once. It is not on until a code from the app confirms it. */
  @Post('begin')
  @HttpCode(200)
  @UseGuards(PerUserThrottlerGuard)
  @Header('Cache-Control', 'no-store')
  async begin(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(passwordConfirmationBodySchema))
    body: PasswordConfirmationBody,
  ): Promise<SecondFactorEnrolment> {
    const enrolment = await beginSecondFactorEnrolment(this.deps, {
      tenantId,
      userId,
      password: body.password,
      issuer: await this.issuer(tenantId),
    });
    return secondFactorEnrolmentSchema.parse(enrolment);
  }

  /** The first code that fits switches it on and gives the recovery codes, once. */
  @Post('confirm')
  @HttpCode(200)
  @UseGuards(PerUserThrottlerGuard)
  @Header('Cache-Control', 'no-store')
  async confirm(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @SessionToken() currentSessionToken: string,
    @Body(new ZodValidationPipe(confirmSecondFactorBodySchema))
    body: ConfirmSecondFactorBody,
  ): Promise<RecoveryCodes> {
    const { recoveryCodes } = await confirmSecondFactorEnrolment(this.deps, {
      tenantId,
      userId,
      code: body.code,
      currentSessionToken,
    });
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: 'account.two_factor_enabled',
      targetId: userId,
    });
    return recoveryCodesSchema.parse({ recoveryCodes });
  }

  /** New recovery codes; the old ones stop working. */
  @Post('recovery-codes')
  @HttpCode(200)
  @UseGuards(PerUserThrottlerGuard)
  @Header('Cache-Control', 'no-store')
  async recoveryCodes(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(passwordConfirmationBodySchema))
    body: PasswordConfirmationBody,
  ): Promise<RecoveryCodes> {
    const { recoveryCodes } = await regenerateRecoveryCodes(this.deps, {
      tenantId,
      userId,
      password: body.password,
    });
    return recoveryCodesSchema.parse({ recoveryCodes });
  }

  @Post('disable')
  @HttpCode(204)
  @UseGuards(PerUserThrottlerGuard)
  async disable(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @SessionToken() currentSessionToken: string,
    @Body(new ZodValidationPipe(passwordConfirmationBodySchema))
    body: PasswordConfirmationBody,
  ): Promise<void> {
    await disableSecondFactor(this.deps, {
      tenantId,
      userId,
      password: body.password,
      currentSessionToken,
    });
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: 'account.two_factor_disabled',
      targetId: userId,
    });
  }

  /**
   * What the app shows beside the code: the site's name, so two installations
   * in one app are told apart. A site that cannot be read is not a reason to
   * refuse a security feature.
   */
  private async issuer(tenantId: string): Promise<string> {
    try {
      const site = await this.site.require(tenantId);
      return site.name.trim() || SECOND_FACTOR_ISSUER_FALLBACK;
    } catch {
      return SECOND_FACTOR_ISSUER_FALLBACK;
    }
  }
}
