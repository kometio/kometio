import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/http-client';
import {
  fetchSetupStatus,
  importSiteArchive,
} from '../../lib/setup-api-client';

export type SiteImportState =
  | { step: 'idle' }
  | { step: 'uploading'; sent: number; total: number }
  /** Accepted: the server stops, opens the site and starts again, and this waits for it. */
  | { step: 'opening' }
  | {
      step: 'failed';
      message: string;
      /** The server was stopped and started again for it, so it has a new setup token. */
      restarted: boolean;
    };

/** How often the server is asked while it is away, and for how long before it is given up on. */
const POLL_EVERY_MS = 1500;
const GIVE_UP_AFTER_MS = 20 * 60 * 1000;

/**
 * A sentence of the server's, as the editor writes one: the launcher's are made
 * to be read in a log as well, in lower case and with no full stop.
 */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * Opening a site archive from the first-run screen (docs/adr/0106): the upload,
 * and then the wait.
 *
 * The wait is the part with something to know. Opening the archive stops the API
 * that took the upload and starts it again, so for a minute or more the screen
 * asks a server that is not there; that is expected, and is how it tells the two
 * ends apart. When the API answers again, "set up" is the site that was in the
 * archive, and "not set up" is that it did not come through, with the reason in
 * `importFailure` if the server had one. An answer of "not set up" and no reason
 * is only a failure once the server has been seen to be away: before that it is
 * the API that took the upload, which has not stopped yet.
 *
 * Nothing here retries an upload: a file as big as a site is not sent twice
 * without somebody saying so.
 */
export function useSiteImport({ onImported }: { onImported: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<SiteImportState>({ step: 'idle' });
  // The page may be left while it waits: nothing is done on its behalf then.
  const leftRef = useRef(false);
  const onImportedRef = useRef(onImported);
  useEffect(() => {
    onImportedRef.current = onImported;
  }, [onImported]);
  useEffect(() => {
    leftRef.current = false;
    return () => {
      leftRef.current = true;
    };
  }, []);

  const failed = useCallback((message: string, restarted: boolean) => {
    if (!leftRef.current) setState({ step: 'failed', message, restarted });
  }, []);

  const waitForTheServer = useCallback(async () => {
    const startedAt = Date.now();
    let seenAway = false;
    while (!leftRef.current && Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
      if (leftRef.current) return;
      try {
        const status = await fetchSetupStatus();
        if (status.hasBeenSetUp) {
          onImportedRef.current();
          return;
        }
        if (status.importFailure !== null) {
          failed(asSentence(status.importFailure), true);
          return;
        }
        if (seenAway) {
          failed(t('setup.import.notFinished'), true);
          return;
        }
      } catch {
        seenAway = true;
      }
    }
    failed(t('setup.import.notFinished'), true);
  }, [failed, t]);

  const start = useCallback(
    async (file: File, setupToken: string) => {
      setState({ step: 'uploading', sent: 0, total: file.size });
      try {
        await importSiteArchive({
          file,
          setupToken,
          onProgress: (sent, total) => {
            if (!leftRef.current) setState({ step: 'uploading', sent, total });
          },
        });
      } catch (error) {
        // Refused or cut before the server did anything: it is the same one, with
        // the same token.
        failed(
          error instanceof ApiError && error.status === 401
            ? t('setup.tokenError')
            : error instanceof ApiError && error.displayMessage !== null
              ? asSentence(error.displayMessage)
              : t('setup.import.uploadFailed'),
          false,
        );
        return;
      }
      if (leftRef.current) return;
      setState({ step: 'opening' });
      await waitForTheServer();
    },
    [failed, t, waitForTheServer],
  );

  return { state, start };
}
