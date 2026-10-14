import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  InvalidCredentialsError,
  UserNotActiveError,
} from '@kometio/domain-core';
import {
  LoginThrottlerGuard,
  PerAccountThrottlerGuard,
} from './per-account-throttler.guard';
import {
  acceptInvite,
  confirmEmailChange,
  getSignedInUser,
  loginUser,
  logoutUser,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@kometio/application';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  acceptInviteBodySchema,
  type AcceptInviteBody,
  confirmEmailChangeBodySchema,
  type ConfirmEmailChangeBody,
  loginBodySchema,
  type LoginBody,
  requestPasswordResetBodySchema,
  type RequestPasswordResetBody,
  resetPasswordBodySchema,
  type ResetPasswordBody,
  verifyEmailBodySchema,
  type VerifyEmailBody,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from './session-auth.guard';
import { AuthErrorsFilter } from './auth-errors.filter';
import {
  SESSION_COOKIE_NAME,
  SessionCookies,
  type CookieWriter,
} from './session-cookies';
import { TenantId, UserId } from './session-identity.decorator';
import type { AuthDeps } from './auth.deps';
import { AUTH_DEPS } from './auth.tokens';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';
import { AuditRecorder } from '../audit/audit-recorder';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';
import { roleInDemo } from '../demo-mode';

@Controller('auth')
@UseFilters(AuthErrorsFilter)
export class AuthController {
  constructor(
    @Inject(AUTH_DEPS) private readonly deps: AuthDeps,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly cookies: SessionCookies,
    private readonly undeliveredEmails: UndeliveredEmailLog,
    private readonly audit: AuditRecorder,
  ) {}

  @UseGuards(ThrottlerGuard, LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginBodySchema)) body: LoginBody,
    @Req() request: Pick<Request, 'headers'>,
    @Res({ passthrough: true }) response: CookieWriter,
  ) {
    const tenantId = await this.deps.tenant.require();
    const session = await loginUser(this.deps, {
      tenantId,
      email: body.email,
      password: body.password,
      captchaToken: body.captchaToken,
      userAgent: request.headers['user-agent'],
    }).catch(async (error: unknown) => {
      await this.recordFailedLogin(tenantId, error);
      throw error;
    });
    await this.audit.record({
      tenantId,
      actorUserId: session.userId,
      action: 'login.succeeded',
    });

    this.cookies.set(response, session);
    return { userId: session.userId };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    // cookie-parser may not have run: there may be none.
    @Req() request: Partial<Pick<Request, 'cookies'>>,
    @Res({ passthrough: true }) response: CookieWriter,
  ) {
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === 'string') {
      await logoutUser(this.deps, { token });
    }
    this.cookies.clear(response);
    return { success: true };
  }

  /**
   * Who is asking — the one question the editor could not put to this
   * API at all.
   *
   * Without it the interface cannot know a person's role, so it offered
   * every screen to everybody and let the server say no: an Editor saw
   * "Users" in the sidebar, clicked it, and got a generic error page.
   * The server refusing is correct; the interface pretending the door
   * was open is not.
   *
   * Deliberately no permission list, just the role. Which screens a role
   * may open is the interface's own business, and a list here would be a
   * second place to keep it in step with the @Roles() decorators that
   * actually decide.
   */
  @UseGuards(SessionAuthGuard)
  @Get('session')
  async currentSession(@TenantId() tenantId: string, @UserId() userId: string) {
    const user = await getSignedInUser(this.deps, { tenantId, userId });
    if (!user) throw new UnauthorizedException();
    // In a demo nobody is above a publisher (docs/adr/0118): the editor reads
    // its screens from this role, and it has to say what the guard enforces.
    return this.env.KOMETIO_DEMO === 'true'
      ? { ...user, role: roleInDemo(user.role) }
      : user;
  }

  @UseGuards(SessionAuthGuard)
  @Post('verify-email/resend')
  @HttpCode(200)
  async resendVerificationEmail(
    @TenantId() tenantId: string,
    @UserId() userId: string,
  ) {
    await requestEmailVerification(this.deps, {
      tenantId,
      userId,
      verifyUrlBase: this.env.EDITOR_APP_URL,
    });
    return { success: true };
  }

  // Higher limit than login/request-password-reset's 5/60s default: these
  // three consume a 256-bit token (brute-force impractical regardless of
  // rate limiting), so the guard here is defense-in-depth/consistency, not
  // the primary defense — a generous limit avoids throttling a legitimate
  // user who double-clicks a link, while still capping abuse.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('verify-email')
  @HttpCode(200)
  async confirmEmailVerification(
    @Body(new ZodValidationPipe(verifyEmailBodySchema)) body: VerifyEmailBody,
  ) {
    await verifyEmail(this.deps, { token: body.token });
    return { success: true };
  }

  // Same limits as verify-email above, and for the same reason: the token is
  // 256 bits, so the limit is not what protects it. No session is asked
  // for: the link is opened from a mailbox, often on another device, and it
  // is the new address's owner who follows it.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('confirm-email-change')
  @HttpCode(200)
  async confirmEmailChange(
    @Body(new ZodValidationPipe(confirmEmailChangeBodySchema))
    body: ConfirmEmailChangeBody,
  ) {
    const { undeliveredNotices, tenantId, userId } = await confirmEmailChange(
      this.deps,
      {
        token: body.token,
        editorUrlBase: this.env.EDITOR_APP_URL,
      },
    );
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: 'account.email_changed',
      targetId: userId,
    });
    // The address is changed: the notice to the one left behind that did not
    // go out is for the log, not an error for the person who followed the link.
    this.undeliveredEmails.report(
      'Email change (notice to the old address)',
      undeliveredNotices,
    );
    return { success: true };
  }

  @UseGuards(ThrottlerGuard, PerAccountThrottlerGuard)
  @Post('request-password-reset')
  @HttpCode(200)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(requestPasswordResetBodySchema))
    body: RequestPasswordResetBody,
  ) {
    const { undelivered } = await requestPasswordReset(this.deps, {
      tenantId: await this.deps.tenant.require(),
      email: body.email,
      resetUrlBase: this.env.EDITOR_APP_URL,
      captchaToken: body.captchaToken,
    });
    // A mail server that is down is for the log, never for the person who asked:
    // an error for an address that has an account and a success for one that
    // has not would say which is which.
    this.undeliveredEmails.report('Password reset', undelivered);
    // Always the same response, whether or not the email matched a real
    // account — see requestPasswordReset's own anti-enumeration doc comment.
    return { success: true };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(200)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(resetPasswordBodySchema))
    body: ResetPasswordBody,
  ) {
    const { tenantId, userId } = await resetPassword(this.deps, {
      token: body.token,
      newPassword: body.newPassword,
    });
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: 'account.password_reset',
      targetId: userId,
    });
    return { success: true };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteBodySchema))
    body: AcceptInviteBody,
  ) {
    await acceptInvite(this.deps, {
      token: body.token,
      password: body.password,
    });
    return { success: true };
  }

  /**
   * A failed sign-in into an account that exists (docs/adr/0130): a wrong
   * password, or the right one for an account that is switched off. An address
   * nobody has is not written down: it is what a person typed, and a log that
   * took whatever it was given would be filled by whoever tried.
   */
  private async recordFailedLogin(
    tenantId: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof InvalidCredentialsError && error.userId) {
      await this.audit.record({
        tenantId,
        actorUserId: error.userId,
        action: 'login.failed',
        detail: { reason: 'wrong-password' },
      });
    } else if (error instanceof UserNotActiveError) {
      await this.audit.record({
        tenantId,
        actorUserId: error.userId,
        action: 'login.failed',
        detail: { reason: 'deactivated' },
      });
    }
  }
}
