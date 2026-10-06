import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';
import { Refusal } from './archive.mjs';
import { startControlServer } from './control-server.mjs';

// Unix socket paths are short (104 bytes on a Mac): a folder in the system's
// temp, not one under the repository.
const directory = mkdtempSync(`${tmpdir()}/kcs-`);
const socketPath = `${directory}/run/control.sock`;

/** What `prepareExport` returns, with the parts a test decides. */
function fakeArchive({ write, discarded }) {
  return {
    fileName: 'kometio-site-20261005-1200.tar.gz',
    write,
    discard: () => discarded.push('discarded'),
  };
}

/** One request over the socket: the status, the headers and what came before the connection ended. */
function ask(path, method = 'GET') {
  return new Promise((resolve) => {
    const req = request({ socketPath, path, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', (error) =>
        resolve({ status: response.statusCode, aborted: error, chunks }),
      );
      response.on('aborted', () =>
        resolve({ status: response.statusCode, aborted: true, chunks }),
      );
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString(),
          aborted: false,
        }),
      );
    });
    req.on('error', (error) => resolve({ failed: error }));
    req.end();
  });
}

describe('the control server', () => {
  let prepare;
  let server;
  const said = [];

  before(async () => {
    server = await startControlServer({
      socketPath,
      prepare: () => prepare(),
      say: (message) => said.push(message),
    });
  });

  after(() => {
    server.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('listens for its owner alone', () => {
    assert.equal(statSync(socketPath).mode & 0o777, 0o600);
    assert.equal(statSync(`${directory}/run`).mode & 0o777, 0o700);
  });

  it('streams the archive, named, and cleans up after it', async () => {
    const discarded = [];
    prepare = async () =>
      fakeArchive({
        discarded,
        write: async (out) => {
          out.write('first ');
          out.write('second');
        },
      });

    const answer = await ask('/export');

    assert.equal(answer.status, 200);
    assert.equal(answer.body, 'first second');
    assert.equal(answer.headers['content-type'], 'application/gzip');
    assert.equal(
      answer.headers['content-disposition'],
      'attachment; filename="kometio-site-20261005-1200.tar.gz"',
    );
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.deepEqual(discarded, ['discarded']);
  });

  it('starts the answer before the archive is made', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    prepare = async () =>
      fakeArchive({
        discarded: [],
        write: async (out) => {
          await gate; // the dump
          out.write('archive');
        },
      });

    const early = await new Promise((resolve) => {
      const req = request({ socketPath, path: '/export' }, (response) => {
        resolve(response.statusCode);
        response.resume();
        release();
      });
      req.end();
    });

    assert.equal(early, 200);
  });

  it('answers a refusal as one, before any of the archive', async () => {
    const discarded = [];
    prepare = async () => {
      throw new Refusal('there is no site to export');
    };

    const answer = await ask('/export');

    assert.equal(answer.status, 409);
    assert.deepEqual(JSON.parse(answer.body), {
      message: 'there is no site to export',
    });
    assert.deepEqual(discarded, []);
  });

  it('answers a failure to prepare as a failure, and says so in its log', async () => {
    prepare = async () => {
      throw new Error('psql failed: connection refused');
    };

    const answer = await ask('/export');

    assert.equal(answer.status, 500);
    assert.match(JSON.parse(answer.body).message, /connection refused/);
    assert.ok(said.some((line) => /connection refused/.test(line)));
  });

  it('cuts an archive that failed on its way, instead of ending it as if it were whole', async () => {
    const discarded = [];
    prepare = async () =>
      fakeArchive({
        discarded,
        write: async (out) => {
          out.write('half of it');
          throw new Error('tar failed');
        },
      });

    const answer = await ask('/export');

    assert.ok(answer.aborted || answer.failed, 'the connection was cut');
    assert.notEqual(answer.body, 'half of it');
    assert.deepEqual(discarded, ['discarded']);
  });

  it('makes one archive at a time', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const discarded = [];
    prepare = async () =>
      fakeArchive({
        discarded,
        write: async (out) => {
          await gate;
          out.write('done');
        },
      });

    const first = ask('/export');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await ask('/export');
    release();
    const firstAnswer = await first;

    assert.equal(second.status, 409);
    assert.match(JSON.parse(second.body).message, /already being made/);
    assert.equal(firstAnswer.status, 200);
    assert.equal(firstAnswer.body, 'done');
    // And once it is over, the next one is made.
    prepare = async () =>
      fakeArchive({ discarded: [], write: async (out) => out.write('next') });
    assert.equal((await ask('/export')).body, 'next');
  });

  it('knows no other route, and no other method', async () => {
    assert.equal((await ask('/')).status, 404);
    assert.equal((await ask('/export/extra')).status, 404);
    assert.equal((await ask('/export', 'POST')).status, 405);
  });
});
