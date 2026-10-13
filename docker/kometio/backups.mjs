// The image backs itself up (docs/adr/0119).
//
// A backup is the archive of the site that Settings → Export makes (docs/adr/0105),
// written to a folder of the volume on a schedule and kept a while. Nothing here
// makes an archive: it asks for one, over the socket the editor's export uses,
// so that the dump, the lock that keeps two exports from running together and
// the format are the ones that are already proved, and a backup restores with
// `import` like any other.
//
// What it protects against is a mistake — a page deleted, an import that went
// wrong, an update that should not have been made — not the loss of the
// machine, since the folder is on the same volume. For that, the folder is the
// thing to copy off the machine (the README says how), and `KOMETIO_BACKUP_PING_URL`
// is how a monitor is told that a backup was made, or was not.
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { request } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { archiveFileName } from './archive.mjs';
import { messageOf } from './error-message.mjs';

/** Where the backups are, under the data directory: root's, since an archive holds the accounts' password hashes. */
export const BACKUPS_FOLDER = 'backups';

/** What an archive the server makes is called (archive.mjs); only these are ever listed or removed from the folder. */
export const BACKUP_NAME = /^kometio-site-\d{8}-\d{4}\.tar\.gz$/;

const HOUR = 60 * 60 * 1000;
const DEFAULT_EVERY_HOURS = 24;
const DEFAULT_KEEP = 7;

/** After a failure, or when the server is busy: not at once, and not never. */
const RETRY_AFTER = 30 * 60 * 1000;
/** On a server that has just started, so that a restart loop is not a backup loop. */
const FIRST_AFTER = 10 * 60 * 1000;

/**
 * What the environment says about backups, or the reason it cannot be read.
 * A typo that quietly switched backups off is the worst thing this could do, so
 * a value that is not a number refuses to start, like DOMAIN does.
 *
 * `KOMETIO_BACKUP_EVERY_HOURS=0` is off. A demo takes none: it is made again from
 * its seed (docs/adr/0118).
 */
export function backupSettings(env) {
  const everyHours = whole(
    env.KOMETIO_BACKUP_EVERY_HOURS,
    DEFAULT_EVERY_HOURS,
    'KOMETIO_BACKUP_EVERY_HOURS',
    0,
  );
  const keep = whole(
    env.KOMETIO_BACKUP_KEEP,
    DEFAULT_KEEP,
    'KOMETIO_BACKUP_KEEP',
    1,
  );
  const ping = (env.KOMETIO_BACKUP_PING_URL ?? '').trim();
  if (ping !== '' && !/^https?:\/\/[^\s]+$/i.test(ping)) {
    throw new Error(
      'KOMETIO_BACKUP_PING_URL has to be an address, like https://hc-ping.com/your-uuid',
    );
  }
  return {
    enabled: everyHours > 0 && env.KOMETIO_DEMO !== 'true',
    everyHours,
    keep,
    pingUrl: ping === '' ? null : ping,
  };
}

function whole(value, fallback, name, minimum) {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d{1,4}$/.test(value.trim()) || Number(value) < minimum) {
    throw new Error(
      `${name} has to be a whole number, ${minimum} or more (it is "${value}")`,
    );
  }
  return Number(value);
}

/** The backups in a folder, newest first. Their names carry their time, so the name is the order. */
export function listBackups(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
    .reverse();
}

/** Removes all but the newest `keep`, and what a backup that was cut short left. Returns the names removed. */
export function pruneBackups(directory, keep) {
  const removed = [];
  for (const name of listBackups(directory).slice(keep)) {
    rmSync(`${directory}/${name}`, { force: true });
    removed.push(name);
  }
  for (const name of existsSync(directory) ? readdirSync(directory) : []) {
    if (name.startsWith('.') && name.endsWith('.partial')) {
      rmSync(`${directory}/${name}`, { force: true });
    }
  }
  return removed;
}

/**
 * Asks the server on `socketPath` for the archive of the site, and writes it
 * into `directory`: to a file of its own that is not a backup until it is whole,
 * so that a backup that failed half way is never what a restore finds.
 *
 * Throws with the server's own sentence when it would not (busy; no site yet;
 * the dump failed), and leaves what was there as it was.
 */
export async function makeBackup({
  socketPath,
  directory,
  keep,
  now = () => new Date(),
}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const received = await new Promise((resolve, reject) => {
    request({ socketPath, path: '/export', method: 'GET' }, resolve)
      .on('error', reject)
      .end();
  });
  if (received.statusCode !== 200) {
    let said = '';
    for await (const chunk of received) said += chunk;
    throw new Error(
      sentenceOf(said) || `the server answered ${received.statusCode}`,
    );
  }
  const name = nameFrom(received.headers['content-disposition'], now());
  const partial = `${directory}/.${name}.partial`;
  try {
    await pipeline(received, createWriteStream(partial, { mode: 0o600 }));
    // A response cut short by the server dying is an error to the stream; one
    // that ended is whole, since the server destroys the connection on failure.
    renameSync(partial, `${directory}/${name}`);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  const removed = pruneBackups(directory, keep);
  return {
    name,
    path: `${directory}/${name}`,
    bytes: statSync(`${directory}/${name}`).size,
    removed,
  };
}

function sentenceOf(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
}

/** The name the server gave the archive, if it is one of ours; otherwise the one this clock makes. */
function nameFrom(contentDisposition, now) {
  const given = /filename="([^"]+)"/.exec(contentDisposition ?? '')?.[1];
  return given && BACKUP_NAME.test(given) ? given : archiveFileName(now);
}

/**
 * How long to wait for the next backup: an interval after the last one, so a
 * server that is restarted often does not make one each time; soon after the
 * start when there is none yet (and at least a minute, so that the API has
 * come up).
 */
export function delayUntilNext({ lastBackupAt, now, everyMs }) {
  if (lastBackupAt === null) return FIRST_AFTER;
  return Math.max(60 * 1000, lastBackupAt + everyMs - now);
}

/** When the newest backup of a folder was made, or null. */
export function lastBackupTime(directory) {
  const [newest] = listBackups(directory);
  return newest ? statSync(`${directory}/${newest}`).mtimeMs : null;
}

/**
 * Tells a monitor (healthchecks.io and the like) how it went: the address as
 * given for a backup that was made, and `/fail` after it for one that was not.
 * It never throws and never waits long: a monitor that is down must not stop
 * a backup, or the next one.
 */
export async function ping(url, outcome, fetchImpl = fetch) {
  if (!url) return;
  const target = outcome === 'ok' ? url : `${url.replace(/\/+$/, '')}/fail`;
  try {
    await fetchImpl(target, { signal: AbortSignal.timeout(10_000) });
  } catch {
    // Said nowhere: a ping that did not arrive is what the monitor reports.
  }
}

/**
 * Makes a backup every `everyHours`, keeping `keep`, for as long as the process
 * lives. `say` is the launcher's log. Returns `stop`.
 */
export function startBackupSchedule({
  socketPath,
  directory,
  everyHours,
  keep,
  pingUrl,
  say,
  clock = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  make = makeBackup,
  tell = ping,
}) {
  const everyMs = everyHours * HOUR;
  let timer = null;
  let stopped = false;

  const arm = (delay) => {
    if (stopped) return;
    timer = schedule(run, delay);
    timer.unref?.();
  };

  async function run() {
    if (stopped) return;
    try {
      const made = await make({ socketPath, directory, keep });
      say(
        `backup: ${made.name} (${(made.bytes / 1024 / 1024).toFixed(1)} MiB)${made.removed.length ? `, ${made.removed.length} older removed` : ''}`,
      );
      await tell(pingUrl, 'ok');
      arm(everyMs);
    } catch (error) {
      say(`backup failed: ${messageOf(error)}; trying again in 30 minutes`);
      await tell(pingUrl, 'fail');
      arm(RETRY_AFTER);
    }
  }

  const first = delayUntilNext({
    lastBackupAt: lastBackupTime(directory),
    now: clock(),
    everyMs,
  });
  say(
    `backups: every ${everyHours} hour${everyHours === 1 ? '' : 's'}, keeping ${keep}, in ${directory}; the first in ${Math.round(first / 60000)} minutes`,
  );
  arm(first);

  return () => {
    stopped = true;
    if (timer) cancel(timer);
  };
}
