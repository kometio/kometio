// What the launcher lets the API ask of it (docs/adr/0105): today one thing, the
// archive of the site, for the editor's Settings → Export to download. It is the
// launcher's to make: pg_dump and the files of the volume are its, and the API
// is a process that must not be given either.
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
 * Starts listening on `socketPath`, which only `owner` may open ({ uid, gid }; left out
 * where no other user is in play, as in a test). `prepare` is `prepareExport`,
 * with its arguments given: what it returns says how to write an archive.
 * Resolves with the server, once it is listening.
 */
export async function startControlServer({
  socketPath,
  owner,
  prepare,
  say = () => undefined,
}) {
  // One archive at a time: each is a dump of the whole database and a read of
  // every upload, and two together would only slow each other.
  let exporting = false;

  async function serveExport(response) {
    if (exporting) {
      reply(response, 409, 'an export is already being made: wait for it');
      return;
    }
    exporting = true;
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
      exporting = false;
    }
  }

  const server = createServer((request, response) => {
    if (request.url !== '/export') {
      reply(response, 404, 'no such thing');
    } else if (request.method !== 'GET') {
      reply(response, 405, 'only GET');
    } else {
      void serveExport(response);
    }
  });

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
