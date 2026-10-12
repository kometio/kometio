import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Refusal } from './archive.mjs';
import {
  BACKUP_NAME,
  backupSettings,
  delayUntilNext,
  lastBackupTime,
  listBackups,
  makeBackup,
  ping,
  pruneBackups,
  startBackupSchedule,
} from './backups.mjs';
import { startControlServer } from './control-server.mjs';

// Unix socket paths are short: a folder in the system's temp.
const root = mkdtempSync(`${tmpdir()}/kbk-`);
const socketPath = `${root}/run/control.sock`;
const folder = `${root}/backups`;

const NAME = (stamp) => `kometio-site-${stamp}.tar.gz`;

describe('what the environment says about backups', () => {
  it('is on, every 24 hours and keeping 7, when it says nothing', () => {
    assert.deepEqual(backupSettings({}), {
      enabled: true,
      everyHours: 24,
      keep: 7,
      pingUrl: null,
    });
  });

  it('reads its three settings', () => {
    assert.deepEqual(
      backupSettings({
        KOMETIO_BACKUP_EVERY_HOURS: '6',
        KOMETIO_BACKUP_KEEP: '30',
        KOMETIO_BACKUP_PING_URL: ' https://hc-ping.com/abc-123 ',
      }),
      {
        enabled: true,
        everyHours: 6,
        keep: 30,
        pingUrl: 'https://hc-ping.com/abc-123',
      },
    );
  });

  it('is off at 0, and in a demo, which is made again from its seed', () => {
    assert.equal(
      backupSettings({ KOMETIO_BACKUP_EVERY_HOURS: '0' }).enabled,
      false,
    );
    assert.equal(backupSettings({ KOMETIO_DEMO: 'true' }).enabled, false);
  });

  it('refuses a value that is not what it says, instead of switching backups off by a typo', () => {
    assert.throws(
      () => backupSettings({ KOMETIO_BACKUP_EVERY_HOURS: 'daily' }),
      /KOMETIO_BACKUP_EVERY_HOURS has to be a whole number/,
    );
    assert.throws(
      () => backupSettings({ KOMETIO_BACKUP_KEEP: '0' }),
      /KOMETIO_BACKUP_KEEP has to be a whole number, 1 or more/,
    );
    assert.throws(
      () => backupSettings({ KOMETIO_BACKUP_PING_URL: 'not an address' }),
      /KOMETIO_BACKUP_PING_URL has to be an address/,
    );
  });
});

describe('the backups in a folder', () => {
  beforeEach(() => {
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
  });

  it('are the files the server names, newest first, and nothing else', () => {
    for (const stamp of ['20261010-0300', '20261012-0300', '20261011-0300']) {
      writeFileSync(`${folder}/${NAME(stamp)}`, 'x');
    }
    writeFileSync(`${folder}/notes.txt`, 'mine');
    writeFileSync(`${folder}/kometio-site-today.tar.gz`, 'mine');

    assert.deepEqual(listBackups(folder), [
      NAME('20261012-0300'),
      NAME('20261011-0300'),
      NAME('20261010-0300'),
    ]);
  });

  it('are pruned to the newest few, leaving what is not a backup, and what was cut short goes', () => {
    for (const stamp of ['20261010-0300', '20261011-0300', '20261012-0300']) {
      writeFileSync(`${folder}/${NAME(stamp)}`, 'x');
    }
    writeFileSync(`${folder}/notes.txt`, 'mine');
    writeFileSync(`${folder}/.${NAME('20261009-0300')}.partial`, 'half');

    const removed = pruneBackups(folder, 2);

    assert.deepEqual(removed, [NAME('20261010-0300')]);
    assert.deepEqual(readdirSync(folder).sort(), [
      NAME('20261011-0300'),
      NAME('20261012-0300'),
      'notes.txt',
    ]);
  });

  it('say when the last one was made, by the file', () => {
    assert.equal(lastBackupTime(folder), null);
    writeFileSync(`${folder}/${NAME('20261010-0300')}`, 'x');
    const at = new Date('2026-10-10T03:00:00Z');
    utimesSync(`${folder}/${NAME('20261010-0300')}`, at, at);

    assert.equal(lastBackupTime(folder), at.getTime());
  });
});

describe('asking the server for one', () => {
  let prepare;
  let server;

  before(async () => {
    server = await startControlServer({
      socketPath,
      prepare: () => prepare(),
      openArchive: () => {
        throw new Error('not used');
      },
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  const archive = (fileName, write) => ({
    fileName,
    write,
    discard: () => undefined,
  });

  it('writes the archive under the name the server gave it, privately, and prunes', async () => {
    prepare = async () =>
      archive(NAME('20261012-0300'), async (out) => {
        out.write('the whole ');
        out.write('archive');
      });
    // The launcher makes the folder 0700 (ensureDir); so does the first backup.
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    writeFileSync(`${folder}/${NAME('20261001-0300')}`, 'old');
    writeFileSync(`${folder}/${NAME('20261002-0300')}`, 'old');

    const made = await makeBackup({ socketPath, directory: folder, keep: 2 });

    assert.equal(made.name, NAME('20261012-0300'));
    assert.equal(readFileSync(made.path, 'utf8'), 'the whole archive');
    assert.equal(statSync(made.path).mode & 0o777, 0o600);
    // An archive holds the accounts' password hashes: nobody else reads the folder.
    assert.equal(statSync(folder).mode & 0o077, 0);
    assert.deepEqual(made.removed, [NAME('20261001-0300')]);
    assert.deepEqual(listBackups(folder), [
      NAME('20261012-0300'),
      NAME('20261002-0300'),
    ]);
  });

  it('says what the server said when it would not, and leaves nothing behind', async () => {
    prepare = async () => {
      throw new Refusal(
        'there is no site to export: this installation has not been set up yet',
      );
    };

    await assert.rejects(
      makeBackup({ socketPath, directory: folder, keep: 7 }),
      /there is no site to export/,
    );
    assert.deepEqual(listBackups(folder), []);
  });

  it('keeps the earlier backups, and leaves no half of one, when the server fails on the way', async () => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/${NAME('20261001-0300')}`, 'the good one');
    prepare = async () =>
      archive(NAME('20261012-0300'), async (out) => {
        out.write('the first part of an archive');
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('pg_dump failed');
      });

    await assert.rejects(
      makeBackup({ socketPath, directory: folder, keep: 7 }),
    );

    assert.deepEqual(readdirSync(folder), [NAME('20261001-0300')]);
    assert.equal(
      readFileSync(`${folder}/${NAME('20261001-0300')}`, 'utf8'),
      'the good one',
    );
  });

  it('names it by the clock when the server gave a name that is not one of ours', async () => {
    prepare = async () =>
      archive('../../etc/passwd', async (out) => {
        out.write('x');
      });

    const made = await makeBackup({
      socketPath,
      directory: folder,
      keep: 7,
      now: () => new Date('2026-10-12T03:07:00Z'),
    });

    assert.equal(made.name, NAME('20261012-0307'));
    assert.match(made.name, BACKUP_NAME);
    assert.equal(existsSync(`${root}/etc`), false);
  });
});

describe('when the next one is', () => {
  const every = 24 * 60 * 60 * 1000;

  it('soon after the start when there has been none', () => {
    assert.equal(
      delayUntilNext({ lastBackupAt: null, now: 1_000_000, everyMs: every }),
      10 * 60 * 1000,
    );
  });

  it('an interval after the last, so a restart is not a backup', () => {
    const now = 100 * every;
    assert.equal(
      delayUntilNext({ lastBackupAt: now - every / 2, now, everyMs: every }),
      every / 2,
    );
  });

  it('a minute from now at the soonest, when one is overdue', () => {
    const now = 100 * every;
    assert.equal(
      delayUntilNext({ lastBackupAt: now - 3 * every, now, everyMs: every }),
      60 * 1000,
    );
  });
});

describe('the schedule', () => {
  function harness({ results }) {
    const timers = [];
    const said = [];
    const pings = [];
    const calls = [];
    const stop = startBackupSchedule({
      socketPath: '/unused',
      directory: `${root}/schedule-${Math.random()}`,
      everyHours: 24,
      keep: 7,
      pingUrl: 'https://hc-ping.com/abc',
      say: (message) => said.push(message),
      clock: () => 0,
      schedule: (fn, delay) => {
        const timer = { fn, delay, unref: () => undefined };
        timers.push(timer);
        return timer;
      },
      cancel: () => undefined,
      make: async () => {
        calls.push('make');
        const next = results.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      tell: async (url, outcome) => pings.push(outcome),
    });
    return { timers, said, pings, calls, stop };
  }

  const made = {
    name: NAME('20261012-0300'),
    bytes: 2 * 1024 * 1024,
    removed: [],
  };

  it('makes the first soon, then one a day, telling the monitor each time', async () => {
    const { timers, pings, said } = harness({ results: [made] });
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 10 * 60 * 1000);

    await timers[0].fn();

    assert.deepEqual(pings, ['ok']);
    assert.equal(timers.length, 2);
    assert.equal(timers[1].delay, 24 * 60 * 60 * 1000);
    assert.ok(said.some((line) => line.includes(NAME('20261012-0300'))));
  });

  it('tries again in half an hour after a failure, and tells the monitor it failed', async () => {
    const { timers, pings, said } = harness({
      results: [new Error('no space left')],
    });

    await timers[0].fn();

    assert.deepEqual(pings, ['fail']);
    assert.equal(timers[1].delay, 30 * 60 * 1000);
    assert.ok(said.some((line) => line.includes('no space left')));
  });

  it('makes no more once stopped', async () => {
    const { timers, calls, stop } = harness({ results: [made] });
    stop();

    await timers[0].fn();

    assert.deepEqual(calls, []);
  });
});

describe('telling a monitor', () => {
  it('asks the address as given for a backup that was made, and /fail after it for one that was not', async () => {
    const asked = [];
    const fetchImpl = async (url) => asked.push(url);

    await ping('https://hc-ping.com/abc/', 'ok', fetchImpl);
    await ping('https://hc-ping.com/abc/', 'fail', fetchImpl);

    assert.deepEqual(asked, [
      'https://hc-ping.com/abc/',
      'https://hc-ping.com/abc/fail',
    ]);
  });

  it('never throws, and does nothing without an address', async () => {
    await ping('https://hc-ping.com/abc', 'ok', async () => {
      throw new Error('offline');
    });
    await ping(null, 'ok', async () => {
      throw new Error('must not be asked');
    });
  });
});
