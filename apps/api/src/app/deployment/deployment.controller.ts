import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { DeploymentRecord } from '@kometio/api-contracts';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';

/**
 * What the editor needs to know about the server it is talking to, as opposed
 * to a site it edits (docs/adr/0103).
 *
 * For anyone signed in, not only an administrator: it is a plain fact about the
 * deployment, and what each person does with it differs (an administrator who
 * invites is told that the invitation will not be mailed). It is not offered
 * before sign-in, which is why the editor's setup status says nothing of it.
 */
@Controller('deployment')
@UseGuards(SessionAuthGuard)
export class DeploymentController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get()
  get(): DeploymentRecord {
    return { emailConfigured: this.env.SMTP_HOST !== undefined };
  }
}
