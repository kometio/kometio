import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Refusal } from './archive.mjs';
import { createSiteImport, describeFailure } from './site-import.mjs';

describe('describeFailure', () => {
  it('says what a refusal said: it is already in words for a reader', () => {
    assert.equal(
      describeFailure(new Refusal('this archive is of a newer Kometio')),
      'this archive is of a newer Kometio',
    );
  });

  it('says there is no room, which is the failure a person can do something about', () => {
    assert.match(
      describeFailure(
        new Error(
          'the uploaded files could not be copied: cp: write error: No space left on device',
        ),
      ),
      /not enough room on the volume/,
    );
  });

  it('says nothing of what it does not understand: no path, no line of Postgres', () => {
    const said = describeFailure(
      new Error(
        'psql failed: ERROR: relation "/data/postgres/x" does not exist',
      ),
    );

    assert.doesNotMatch(said, /postgres\/x|psql|relation/);
    assert.match(said, /docker logs/);
  });
});

describe('createSiteImport', () => {
  let directory;
  let resultPath;
  let calls;

  beforeEach(() => {
    directory = mkdtempSync(`${tmpdir()}/ksi-`);
    resultPath = `${directory}/import-result.json`;
    calls = [];
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  /** An import whose every collaborator writes down that it was asked. */
  function makeImport({
    hasSite = false,
    restore = async () => undefined,
    read,
  } = {}) {
    return createSiteImport({
      dataDir: '/data',
      siteUrl: 'https://example.com',
      resultPath,
      say: (line) => calls.push(`say: ${line}`),
      graceMs: 0,
      installationHasSite: () => hasSite,
      readArchive:
        read ??
        (async () => ({ discard: () => calls.push('discard archive') })),
      restoreArchive: async (args) => {
        calls.push('restore');
        assert.equal(args.siteUrl, 'https://example.com');
        await restore(args);
      },
      stopServers: async () => calls.push('stop'),
      startServers: async () => calls.push('start'),
    });
  }

  const result = () => JSON.parse(readFileSync(resultPath, 'utf8'));

  it('stops the servers, opens the archive, says how it went, and starts them again', async () => {
    const opened = await makeImport()('the input');

    await opened.run();

    assert.deepEqual(calls, ['stop', 'restore', 'start']);
    assert.equal(result().ok, true);
  });

  it('refuses an installation that has a site before it reads a byte', async () => {
    let read = false;
    const openArchive = makeImport({
      hasSite: true,
      read: async () => {
        read = true;
      },
    });

    await assert.rejects(openArchive('x'), (error) => {
      assert.ok(error instanceof Refusal);
      assert.equal(error.conflict, true);
      assert.match(error.message, /already has a site/);
      return true;
    });
    assert.equal(read, false);
    assert.deepEqual(calls, []);
  });

  it('lets what is wrong with the archive through, with nothing stopped', async () => {
    const openArchive = makeImport({
      read: async () => {
        throw new Refusal('this is not a Kometio site archive');
      },
    });

    await assert.rejects(openArchive('x'), /not a Kometio site archive/);
    assert.deepEqual(calls, []);
    assert.equal(existsSync(resultPath), false);
  });

  it('starts the servers again when the restore failed, and says why in words fit for anybody', async () => {
    const opened = await makeImport({
      restore: async () => {
        throw new Error(
          'psql failed: ERROR: syntax error at /data/secret/path',
        );
      },
    })('x');

    await opened.run();

    assert.deepEqual(
      calls.filter((call) => !call.startsWith('say:')),
      ['stop', 'restore', 'start'],
    );
    assert.equal(result().ok, false);
    assert.doesNotMatch(result().message, /secret|psql/);
    assert.ok(
      calls.some((call) => call.includes('syntax error')),
      'the log has the reason',
    );
  });

  it('writes how it went before the servers start, which is when it is asked', async () => {
    let written = null;
    const base = makeImport();
    const opened = await base('x');
    // Starting the servers is when the API can be asked: the file has to be there.
    const watching = createSiteImport({
      dataDir: '/data',
      siteUrl: 'https://example.com',
      resultPath,
      say: () => undefined,
      graceMs: 0,
      installationHasSite: () => false,
      readArchive: async () => ({ discard: () => undefined }),
      restoreArchive: async () => undefined,
      stopServers: async () => undefined,
      startServers: async () => {
        written = existsSync(resultPath);
      },
    });

    await (await watching('x')).run();

    assert.equal(written, true);
    assert.ok(opened);
  });

  // The API that is still running when the archive is accepted is the one that
  // answers the screen, and it reads this file: what it says about the import
  // before this one must be gone by the time the answer reaches the browser.
  it('forgets what it said about the last import as soon as it has accepted another', async () => {
    writeFileSync(resultPath, JSON.stringify({ ok: false, message: 'old' }));
    let existedAtStop = null;
    const openArchive = createSiteImport({
      dataDir: '/data',
      siteUrl: 'https://example.com',
      resultPath,
      say: () => undefined,
      graceMs: 0,
      installationHasSite: () => false,
      readArchive: async () => ({ discard: () => undefined }),
      restoreArchive: async () => undefined,
      stopServers: async () => {
        existedAtStop = existsSync(resultPath);
      },
      startServers: async () => undefined,
    });

    const opened = await openArchive('x');

    assert.equal(existsSync(resultPath), false, 'gone before the work begins');
    await opened.run();
    assert.equal(existedAtStop, false);
    assert.equal(result().ok, true);
  });

  it('leaves what it said about the last import alone when it refuses the next archive', async () => {
    writeFileSync(resultPath, JSON.stringify({ ok: false, message: 'old' }));
    const openArchive = makeImport({
      read: async () => {
        throw new Refusal('this is not a Kometio site archive');
      },
    });

    await assert.rejects(openArchive('x'));

    assert.equal(result().message, 'old');
  });

  it('discards what was unpacked', async () => {
    const opened = await makeImport()('x');

    opened.discard();

    assert.deepEqual(calls, ['discard archive']);
  });
});
