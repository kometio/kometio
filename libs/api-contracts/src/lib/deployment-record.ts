import { z } from 'zod';

/**
 * `GET /deployment`'s response shape: what the editor needs to know about the
 * SERVER it is talking to, as opposed to a site it edits (docs/adr/0103).
 * Shared between apps/api's DeploymentController and apps/editor-app's
 * deployment-api-client.ts, for the same reason as siteRecordSchema.
 */
export const deploymentRecordSchema = z.object({
  /**
   * Whether this deployment has a mail server (SMTP_HOST is set). When it has
   * none the emails go to the server's log instead, so an invitation or a
   * password reset still exists but nobody receives it, and the editor says so
   * to the administrator.
   */
  emailConfigured: z.boolean(),
});

export type DeploymentRecord = z.infer<typeof deploymentRecordSchema>;
