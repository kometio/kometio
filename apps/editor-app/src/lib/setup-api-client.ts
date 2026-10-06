import { z } from 'zod';
import { API_BASE_URL, ApiError, request, send } from './http-client';

const setupStatusSchema = z.object({
  hasBeenSetUp: z.boolean(),
  /**
   * Why the import the screen was waiting for did not come through, when it
   * did not (docs/adr/0106): a sentence the server chose to be read by anybody.
   * Only ever set while there is no site.
   */
  importFailure: z.string().nullable(),
});

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

export interface ImportSiteArchiveRequest {
  file: File;
  /** The same token as the wizard's: printed in the API's log. */
  setupToken: string;
  /** What has been sent so far, and the whole. */
  onProgress: (sent: number, total: number) => void;
}

/**
 * Sends a site archive to be opened instead of making a new site
 * (docs/adr/0106). Resolves when the server has *accepted* it, which is before
 * it is opened: opening stops and starts the API, so the caller then waits for
 * it with `fetchSetupStatus`.
 *
 * Not through `request()`: the file is the body itself (a `File` is read from
 * the disk as it goes, not held in memory, which matters for an archive as big as
 * a site), it has no timeout of its own (it takes as long as the connection
 * does), and the only way a browser reports how much has been sent is
 * `XMLHttpRequest`. The token goes in a header, because the body is taken.
 */
export function importSiteArchive({
  file,
  setupToken,
  onProgress,
}: ImportSiteArchiveRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new XMLHttpRequest();
    upload.open('POST', `${API_BASE_URL}/setup/import`);
    upload.setRequestHeader('Content-Type', 'application/gzip');
    upload.setRequestHeader('X-Setup-Token', setupToken);
    upload.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    upload.onload = () => {
      if (upload.status >= 200 && upload.status < 300) {
        resolve();
        return;
      }
      let body: unknown = null;
      try {
        body = JSON.parse(upload.responseText);
      } catch {
        // Not JSON: the status is what there is.
      }
      reject(new ApiError(upload.status, body));
    };
    upload.onerror = () => reject(new Error('The upload could not be made'));
    upload.onabort = () => reject(new Error('The upload was cancelled'));
    upload.send(file);
  });
}
