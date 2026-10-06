// What the launcher lets the API ask of it (docs/adr/0105, 0106): the archive of
// the site, for the editor's Settings → Export to download, and the opening of
// one into an installation that has no site yet, from the first-run screen. Both
// are the launcher's to do: pg_dump, the database and the files of the volume are
// its, and the API is a process that must not be given any of them.
//
// It is an HTTP server on a Unix socket, which only the API's user (and root)
// can open: a theme's code runs as another user in this container and cannot
// even reach the directory the socket is in. That is the whole of its access
// control, so it answers whoever connects, and what the API does before asking
// (a session, an administrator's permission) is what decides who gets an archive.
import { createServer } from 'node:http';
import { chmodSync, chownSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Refusal } from './archive.mjs';

export const CONTROL_SOCKET = '/run/kometio/control.sock';

/** An answer that is a message, as JSON. */
function reply(response, status, message) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify({ message }));
}

/**
 * An answer to a request whose body will not be used: it goes out at once, and
 * what is still coming is read and thrown away. Closing instead would cut the
 * connection under a sender that is still writing, and what it would see is the
 * broken pipe, not the answer.
 */
function refuseUnused(request, response, status, message) {
  reply(response, status, message);
  request.resume();
}

/**
 * Starts listening on `socketPath`, which only `owner` may open ({ uid, gid }; left out
 * where no other user is in play, as in a test). `prepare` is `prepareExport`,
 * with its arguments given: what it returns says how to write an archive.
 * `openArchive` is what `createSiteImport` makes: it reads the archive that comes
 * in and judges it, and says what to do once the answer has gone.
 * Resolves with the server, once it is listening.
 */
export async function startControlServer({
  socketPath,
  owner,
  prepare,
  openArchive,
  say = () => undefined,
}) {
  // One thing at a time. An export is a dump of the whole database and a read of
  // every upload, and two together would only slow each other; an import stops
  // the servers and remakes the database, and nothing else may touch it.
  let busyWith = null;

  const refusal = (doing) =>
    doing === 'importing'
      ? 'a site is being opened here: wait for it'
      : 'an export is already being made: wait for it';

  async function serveExport(response) {
    if (busyWith) {
      reply(response, 409, refusal(busyWith));
      return;
    }
    busyWith = 'exporting';
    let archive = null;
    try {
      // What can be refused is refused before the answer starts.
      archive = await prepare();
      // The answer starts now, before the dump: the person downloading sees the
      // file begin, and the dump, which takes as long as the database is big, is
      // not a silence in which a second click looks like the thing to do.
      response.writeHead(200, {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${archive.fileName}"`,
        'cache-control': 'no-store',
      });
      // Headers go with the first byte unless told to go now.
      response.flushHeaders();
      await archive.write(response);
      response.end();
    } catch (error) {
      if (response.headersSent) {
        // Already on its way: an archive cut short must look cut short, not whole.
        say(`the export failed after it had started: ${error.message}`);
        response.destroy(error);
      } else if (error instanceof Refusal) {
        reply(response, 409, error.message);
      } else {
        say(`the export failed: ${error.message}`);
        reply(response, 500, error.message);
      }
    } finally {
      archive?.discard();
      busyWith = null;
    }
  }

  async function serveImport(request, response) {
    if (busyWith) {
      refuseUnused(request, response, 409, refusal(busyWith));
      return;
    }
    busyWith = 'importing';
    let opened;
    try {
      // The archive is read, unpacked and judged before the answer: what is
      // wrong with it is said to the person who sent it, with nothing stopped.
      opened = await openArchive(request);
    } catch (error) {
      busyWith = null;
      if (error instanceof Refusal) {
        refuseUnused(
          request,
          response,
          error.conflict ? 409 : 400,
          error.message,
        );
      } else {
        say(`the archive could not be read: ${error.message}`);
        refuseUnused(request, response, 500, error.message);
      }
      return;
    }
    // Accepted: what follows takes minutes and stops the API that is relaying
    // this answer, so the answer goes first and the work is not waited for.
    reply(response, 202, 'accepted');
    void opened
      .run()
      .catch((error) => say(`the import did not finish: ${error.message}`))
      .finally(() => {
        opened.discard();
        busyWith = null;
      });
  }

  const server = createServer((request, response) => {
    if (request.url === '/export') {
      if (request.method === 'GET') void serveExport(response);
      else reply(response, 405, 'only GET');
    } else if (request.url === '/import') {
      if (request.method === 'POST') void serveImport(request, response);
      else reply(response, 405, 'only POST');
    } else {
      reply(response, 404, 'no such thing');
    }
  });
  // An archive can be gigabytes, arriving at the speed of somebody's connection:
  // five minutes to receive a request is the default, and is not enough for it.
  server.requestTimeout = 0;

  // The directory is closed to everyone else before the socket exists in it.
  const directory = dirname(socketPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (owner) chownSync(directory, owner.uid, owner.gid);
  chmodSync(directory, 0o700);
  // A socket left by a container that was stopped and started again.
  rmSync(socketPath, { force: true });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  if (owner) chownSync(socketPath, owner.uid, owner.gid);
  chmodSync(socketPath, 0o600);
  return server;
}
