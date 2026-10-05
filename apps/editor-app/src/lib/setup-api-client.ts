import { z } from 'zod';
import { request, send } from './http-client';

const setupStatusSchema = z.object({ hasBeenSetUp: z.boolean() });

export type SetupStatus = z.infer<typeof setupStatusSchema>;

export interface BootstrapDeploymentRequest {
  /** Printed in the API's log at boot — see the server's SetupTokenRegistry. */
  setupToken: string;
  siteName: string;
  defaultLocale: string;
  /** The hostname the site is served on, or `null` to set it later in Settings. */
  domain: string | null;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Both endpoints are unauthenticated — they are what runs before anyone
 * can be authenticated. They still go through `request()` like everything
 * else: the timeout and the ApiError shape matter more here than anywhere,
 * because this is the first thing a self-hoster ever sees and an API that
 * is up but unreachable has to read as such rather than hanging.
 */
export async function fetchSetupStatus(): Promise<SetupStatus> {
  return setupStatusSchema.parse(await request('/setup/status'));
}

export function bootstrapDeployment(
  body: BootstrapDeploymentRequest,
): Promise<void> {
  return send('/setup', { method: 'POST', body: JSON.stringify(body) });
}
