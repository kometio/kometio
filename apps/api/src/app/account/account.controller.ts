import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  changeAccountAvatar,
  changeAccountLanguage,
  changePassword,
  getAccountProfile,
  MAX_UPLOAD_BYTES_BY_KIND,
  removeAccountAvatar,
  requestEmailChange,
  updateAccountProfile,
} from '@kometio/application';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type ChangeAccountLanguageBody,
  changeAccountLanguageBodySchema,
  type ChangePasswordBody,
  changePasswordBodySchema,
  type RequestEmailChangeBody,
  requestEmailChangeBodySchema,
  type UpdateAccountProfileBody,
  updateAccountProfileBodySchema,
} from './account.schemas';
import type { AccountDeps } from './account.deps';
import { ACCOUNT_DEPS } from './account.tokens';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';
import { PerUserThrottlerGuard } from '../auth/per-user-throttler.guard';
import {
  SessionToken,
  TenantId,
  UserId,
} from '../auth/session-identity.decorator';

/**
 * The signed-in person's own profile (docs/adr/0071).
 *
 * Every role reaches it, because every role is a person: an editor who
 * writes the articles is exactly who an author page is for. Nothing here
 * takes a user id — the only account it can change is the one the session
 * belongs to, so there is no other person's profile to ask for.
 */
@Controller('account')
@UseGuards(SessionAuthGuard)
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    @Inject(ACCOUNT_DEPS) private readonly deps: AccountDeps,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get('profile')
  profile(@TenantId() tenantId: string, @UserId() userId: string) {
    return getAccountProfile(this.deps, { tenantId, userId });
  }

  @Patch('profile')
  update(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(updateAccountProfileBodySchema))
    body: UpdateAccountProfileBody,
  ) {
    return updateAccountProfile(this.deps, {
      tenantId,
      userId,
      displayName: body.displayName,
      slug: body.slug,
      bio: body.bio,
    });
  }

  /** The language the editor and every email speak to them in, written at once. */
  @Patch('language')
  changeLanguage(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(changeAccountLanguageBodySchema))
    body: ChangeAccountLanguageBody,
  ) {
    return changeAccountLanguage(this.deps, {
      tenantId,
      userId,
      language: body.language,
    });
  }

  /**
   * The password they sign in with, changed by giving the current one.
   * Every other place they are signed in ends; this one stays.
   */
  @Post('password')
  @HttpCode(204)
  @UseGuards(PerUserThrottlerGuard)
  async changePassword(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @SessionToken() currentSessionToken: string,
    @Body(new ZodValidationPipe(changePasswordBodySchema))
    body: ChangePasswordBody,
  ): Promise<void> {
    const { undeliveredNotices } = await changePassword(this.deps, {
      tenantId,
      userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      currentSessionToken,
      editorUrlBase: this.env.EDITOR_APP_URL,
    });
    // The password is changed: a notice that did not go out is for the log,
    // not an error for the person who has just done what they meant to.
    for (const { to, reason } of undeliveredNotices) {
      this.logger.error(
        `Password of ${userId}: the notice to ${to} was not sent`,
        reason instanceof Error ? reason.stack : String(reason),
      );
    }
  }

  /**
   * Asks to sign in with another address. Nothing changes here: a link
   * goes to the NEW address, and the change is made when it is followed
   * (`POST /auth/confirm-email-change`).
   */
  @Post('email-change')
  @HttpCode(204)
  @UseGuards(PerUserThrottlerGuard)
  async requestEmailChange(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(requestEmailChangeBodySchema))
    body: RequestEmailChangeBody,
  ): Promise<void> {
    await requestEmailChange(this.deps, {
      tenantId,
      userId,
      newEmail: body.newEmail,
      currentPassword: body.currentPassword,
      confirmUrlBase: this.env.EDITOR_APP_URL,
    });
  }

  @Post('avatar')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // A photo's ceiling, and refused before it is read: nothing else is
      // ever a profile picture.
      limits: { fileSize: MAX_UPLOAD_BYTES_BY_KIND.image },
    }),
  )
  changeAvatar(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return changeAccountAvatar(this.deps, {
      tenantId,
      userId,
      filename: file.originalname,
      mimeType: file.mimetype,
      data: file.buffer,
    });
  }

  @Delete('avatar')
  removeAvatar(@TenantId() tenantId: string, @UserId() userId: string) {
    return removeAccountAvatar(this.deps, { tenantId, userId });
  }
}
