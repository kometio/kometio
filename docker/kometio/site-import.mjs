// Opening a site archive into a running installation, from the first-run screen
// (docs/adr/0106). The `import` command can stop at nothing and start from
// nothing; a server cannot: its API and its site hold the database open, and
// cache that there is no site yet. So the launcher, which owns those processes,
// stops them, restores, and starts them again, without the container restarting.
//
// What it does not know is how to stop or start a process: the launcher gives it
// that, which is also what lets a test run the order of things without any.
import { chownSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Refusal } from './archive.mjs';

/**
 * What the API reads, after it has started again, to tell the browser how the
 * import went: it is down while the import runs, and the browser is waiting.
 */
export const IMPORT_RESULT_FILE = 'import-result.json';

/**
 * What a failure says to whoever is waiting for the import, who may be anybody
 * (the API answers the first-run screen to anyone): a sentence the person can
 * act on, never a path or a line of what Postgres printed. What was refused is
 * already in words for a reader; the rest is told to the log.
 */
export function describeFailure(error) {
  if (error instanceof Refusal) return error.message;
  if (/no space left/i.test(error.message)) {
    return 'there is not enough room on the volume to open the site: free some, or use a bigger one, and try again';
  }
  return 'the site could not be opened; the server’s log (docker logs) has the reason';
}

/**
 * Makes the function the control socket calls for an archive that arrives:
 * `openArchive(input)` reads and judges it before anything is touched, and
 * resolves with what to do next, `run()`, and `discard()` for what was unpacked.
 * It rejects with a `Refusal` for an archive that cannot be opened or an
 * installation that already has a site; whoever asked is told, and nothing has
 * been stopped.
 *
 * `run()` is for after the answer has gone: it stops the servers, opens the
 * archive, writes how it went, and starts them again whatever happened. A
 * restore that failed has put the installation back as a new one (the caller's
 * `restoreArchive` does), so the servers start on what they started on at first.
 */
export function createSiteImport({
  dataDir,
  siteUrl,
  resultPath,
  owner,
  say,
  graceMs = 1000,
  installationHasSite,
  readArchive,
  restoreArchive,
  stopServers,
  startServers,
}) {
  function writeResult(failure) {
    const result =
      failure === null ? { ok: true } : { ok: false, message: failure };
    writeFileSync(
      resultPath,
      `${JSON.stringify({ ...result, at: new Date().toISOString() })}\n`,
      { mode: 0o600 },
    );
    if (owner) chownSync(resultPath, owner.uid, owner.gid);
  }

  return async function openArchive(input) {
    // Before a byte is read: an installation with a site is not a place to open one.
    if (installationHasSite()) {
      throw new Refusal(
        'this installation already has a site: an archive is opened into a new one, never over a site',
        { conflict: true },
      );
    }
    const archive = await readArchive({ dataDir, input, say });
    // What was said about the last import is not about this one, and it is the
    // API that is still running, and answering the screen, until the work begins.
    rmSync(resultPath, { force: true });
    return {
      discard: () => archive.discard(),
      async run() {
        // The answer that says "accepted" is still on its way to the browser,
        // through the very process that is about to stop.
        await sleep(graceMs);
        await stopServers();
        let failure = null;
        try {
          await restoreArchive({ dataDir, archive, siteUrl, say });
        } catch (error) {
          say(`the import failed: ${error.message}`);
          failure = describeFailure(error);
        }
        writeResult(failure);
        await startServers();
      },
    };
  };
}
