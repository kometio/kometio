import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { DeploymentRecord } from '@kometio/api-contracts';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';

/**
 * What the editor needs to know about the server it is talking to, as opposed
 * to a site it edits (docs/adr/0103).
 *
 * Open to anyone, signed in or not, because the first place the answer is
 * needed is before a session exists: a person who has forgotten their password
 * on a server with no mail server is told that no email will come, instead of
 * waiting for one. So everything in the record has to be fit to be read by
 * whoever asks, and the same for every address: one boolean about the server,
 * never anything about an account. A secret, a person, or a fact that differs
 * by who is asking does not belong in it.
 */
@Controller('deployment')
@UseGuards(ThrottlerGuard)
export class DeploymentController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get()
  get(): DeploymentRecord {
    return { emailConfigured: this.env.SMTP_HOST !== undefined };
  }
}
