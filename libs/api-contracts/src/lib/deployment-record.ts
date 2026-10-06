import { z } from 'zod';

/**
 * `GET /deployment`'s response shape: what the editor needs to know about the
 * SERVER it is talking to, as opposed to a site it edits (docs/adr/0103, 0105).
 * Shared between apps/api's DeploymentController and apps/editor-app's
 * deployment-api-client.ts, for the same reason as siteRecordSchema.
 */
export const deploymentRecordSchema = z.object({
  /**
   * Whether this deployment has a mail server (SMTP_HOST is set). When it has
   * none the emails go to the server's log instead, so an invitation or a
   * password reset still exists but nobody receives it, and the editor says so
   * to whoever is about to depend on it. Open to anyone: it is read before
   * sign-in too, on the forgot-password screen.
   */
  emailConfigured: z.boolean(),
  /**
   * Whether this deployment can export its site from the editor (docs/adr/0105):
   * true on the single Docker image, whose launcher makes the archive, and false
   * wherever the database is somebody else's to dump. The editor offers
   * Settings → Export only where it is true. Open to anyone, like the rest:
   * it says what the server is, not what is in it.
   */
  siteArchive: z.boolean(),
});

export type DeploymentRecord = z.infer<typeof deploymentRecordSchema>;
