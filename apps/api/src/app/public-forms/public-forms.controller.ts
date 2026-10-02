import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  getPublicForm,
  submitForm,
  uploadFormAttachment,
} from '@kometio/application';
import { type PublicForm, publicFormSchema } from '@kometio/api-contracts';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type SubmitFormBody,
  submitFormBodySchema,
} from './public-forms.schemas';
import { UuidParam } from '../uuid-param.decorator';
import {
  AttachmentQuotaGuard,
  MAX_ATTACHMENT_BYTES,
} from './attachment-quota.guard';
import type { PublicFormsDeps } from './public-forms.deps';
import { PUBLIC_FORMS_DEPS } from './public-forms.tokens';

// No SessionAuthGuard — the public, unauthenticated path apps/public-site's
// Form block calls (field definitions live-fetched, docs/adr/0015) and its
// same-origin submission proxy posts through. ThrottlerGuard is stricter
// than PublicPagesController's read traffic (120/60s): a write endpoint is
// the one a spam bot actually wants to hit repeatedly.
@Controller('public/forms')
@UseGuards(ThrottlerGuard)
export class PublicFormsController {
  private readonly logger = new Logger(PublicFormsController.name);

  constructor(
    @Inject(PUBLIC_FORMS_DEPS) private readonly deps: PublicFormsDeps,
  ) {}

  @Get(':id')
  async findById(@UuidParam('id') id: string): Promise<PublicForm> {
    return publicFormSchema.parse(
      await getPublicForm(this.deps, {
        tenantId: await this.deps.tenant.require(),
        formId: id,
      }),
    );
  }

  // No CAPTCHA re-check here on purpose: a Turnstile token is single-use
  // (a second verify() call with the same token fails), and the final
  // /submissions call below already verifies it once for the whole
  // transaction — this endpoint is protected by ThrottlerGuard only, same
  // as every other write endpoint in this controller. A determined bot
  // could still spam uploads without ever completing a real submission;
  // accepted at this scale (same "not solved further here" trade-off
  // ADR-0015 already made for the second-round-trip live-fetch cost).
  @Post(':id/attachments')
  @UseGuards(AttachmentQuotaGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  async uploadAttachment(
    @UuidParam('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Unauthenticated endpoint — file.mimetype/originalname are entirely
    // client-controlled; the use case reads the real type from the bytes.
    return uploadFormAttachment(this.deps, {
      tenantId: await this.deps.tenant.require(),
      formId: id,
      filename: file.originalname,
      declaredMimeType: file.mimetype,
      data: file.buffer,
    });
  }

  @Post(':id/submissions')
  @HttpCode(204)
  async submit(
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(submitFormBodySchema)) body: SubmitFormBody,
  ): Promise<void> {
    const { undeliveredNotifications } = await submitForm(this.deps, {
      tenantId: await this.deps.tenant.require(),
      formId: id,
      pageId: body.pageId,
      values: body.values,
      honeypot: body.honeypot,
      captchaToken: body.captchaToken,
    });
    // The answers are saved: a notification that did not go out is the
    // site owner's to find in the log, and the submission list still has
    // it, rather than the visitor's error to retry.
    for (const { to, reason } of undeliveredNotifications) {
      this.logger.error(
        `Form ${id}: notification to ${to} was not sent`,
        reason instanceof Error ? reason.stack : String(reason),
      );
    }
  }
}
