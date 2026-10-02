import { z } from 'zod';
import { MIN_ADMIN_PASSWORD_LENGTH } from '@kometio/shared-types';

/**
 * Password rules live here rather than in the use case, the same place
 * they live for accepting an invite: a minimum length is a policy about
 * what a person may type, not about what a valid deployment is.
 *
 * More than an invited person's minimum (`MIN_ADMIN_PASSWORD_LENGTH`, not
 * `MIN_PASSWORD_LENGTH`). This is the one account that can never be locked
 * out by an administrator above it, on an installation whose login page is
 * reachable from the public internet by design.
 */
export const bootstrapDeploymentBodySchema = z.object({
  // Printed to the API's log at boot, see SetupTokenRegistry — what stops a
  // stranger claiming an installation before its owner gets to it.
  setupToken: z.string().min(1),
  siteName: z.string().trim().min(1).max(120),
  // Matches the picker in the editor's own locale settings (docs/adr/0017)
  // — a BCP-47 tag, not a free-form string.
  defaultLocale: z.string().trim().min(2).max(35),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(MIN_ADMIN_PASSWORD_LENGTH).max(200),
});
export type BootstrapDeploymentBody = z.infer<
  typeof bootstrapDeploymentBodySchema
>;
