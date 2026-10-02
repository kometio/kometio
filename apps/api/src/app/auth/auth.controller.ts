import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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
} from './auth.schemas';
import { SessionAuthGuard } from './session-auth.guard';
import { AuthErrorsFilter } from './auth-errors.filter';
import { SESSION_COOKIE_NAME, SessionCookies } from './session-cookies';
import { TenantId, UserId } from './session-identity.decorator';
import type { AuthDeps } from './auth.deps';
import { AUTH_DEPS } from './auth.tokens';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';

@Controller('auth')
@UseFilters(AuthErrorsFilter)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(AUTH_DEPS) private readonly deps: AuthDeps,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly cookies: SessionCookies,
  ) {}

  @UseGuards(ThrottlerGuard, LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginBodySchema)) body: LoginBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await loginUser(this.deps, {
      tenantId: await this.deps.tenant.require(),
      email: body.email,
      password: body.password,
      captchaToken: body.captchaToken,
    });

    this.cookies.set(response, session);
    return { userId: session.userId };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
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
    return user;
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
    const { undeliveredNotices } = await confirmEmailChange(this.deps, {
      token: body.token,
      editorUrlBase: this.env.EDITOR_APP_URL,
    });
    // The address is changed: the notice to the one left behind that did not
    // go out is for the log, not an error for the person who followed the link.
    for (const { to, reason } of undeliveredNotices) {
      this.logger.error(
        `Email change: the notice to ${to} was not sent`,
        reason instanceof Error ? reason.stack : String(reason),
      );
    }
    return { success: true };
  }

  @UseGuards(ThrottlerGuard, PerAccountThrottlerGuard)
  @Post('request-password-reset')
  @HttpCode(200)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(requestPasswordResetBodySchema))
    body: RequestPasswordResetBody,
  ) {
    await requestPasswordReset(this.deps, {
      tenantId: await this.deps.tenant.require(),
      email: body.email,
      resetUrlBase: this.env.EDITOR_APP_URL,
      captchaToken: body.captchaToken,
    });
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
    await resetPassword(this.deps, {
      token: body.token,
      newPassword: body.newPassword,
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
}
