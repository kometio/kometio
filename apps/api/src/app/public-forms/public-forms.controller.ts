import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
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
} from '@kometio/api-contracts';
import { UuidParam } from '../uuid-param.decorator';
import {
  AttachmentQuotaGuard,
  MAX_ATTACHMENT_BYTES,
} from './attachment-quota.guard';
import type { PublicFormsDeps } from './public-forms.deps';
import { PUBLIC_FORMS_DEPS } from './public-forms.tokens';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';
import { PublicPagesThrottlerGuard } from '../public-pages/public-pages-throttler.guard';

/**
 * What the page's own read of a form may cost one visitor: the same as any
 * other public page read (PublicPagesModule's 120 a minute), since every view
 * of a page that has a form makes one.
 */
const FORM_READS_PER_MINUTE = 120;

// No SessionAuthGuard — the public, unauthenticated path apps/public-site's
// Form block calls (field definitions live-fetched, docs/adr/0015) and its
// same-origin submission proxy posts through. The writes are limited to the
// module's ten a minute — a write endpoint is the one a spam bot actually
// wants to hit repeatedly — and the read is not: it is a page view.
//
// Counted per visitor, not per address: every call comes from the public
// site's server, so with a plain guard the whole site shared ten page views
// and ten answers a minute, and the eleventh visitor's page lost its form
// (PublicPagesThrottlerGuard says how the visitor is told).
@Controller('public/forms')
@UseGuards(PublicPagesThrottlerGuard)
export class PublicFormsController {
  constructor(
    @Inject(PUBLIC_FORMS_DEPS) private readonly deps: PublicFormsDeps,
    private readonly undeliveredEmails: UndeliveredEmailLog,
  ) {}

  @Get(':id')
  @Throttle({ default: { limit: FORM_READS_PER_MINUTE, ttl: 60_000 } })
  async findById(@UuidParam('id') id: string): Promise<PublicForm> {
    return publicFormSchema.parse(
      await getPublicForm(this.deps, {
        tenantId: await this.deps.tenant.require(),
        formId: id,
      }),
    );
  }

  // No CAPTCHA re-check here on purpose: a captcha solution is single-use
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
    this.undeliveredEmails.report(
      `Form ${id} (notification)`,
      undeliveredNotifications,
    );
  }
}
