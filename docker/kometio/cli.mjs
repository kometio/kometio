// `export` and `import` (docs/adr/0105), as the image's commands:
//
//   docker exec kometio node /opt/kometio/cli.mjs export > site.tar.gz
//   docker exec kometio node /opt/kometio/cli.mjs backup   (into /data/backups, docs/adr/0119)
//   docker stop kometio
//   docker run --rm -i -v kometio-data:/data [-e DOMAIN=…] ghcr.io/kometio/kometio:0.1.0-beta.1 import < site.tar.gz
//
// An export works on a running server (or on a volume nobody uses, with
// `docker run … export`); an import only on a volume nobody is using, because the
// database is made again under it. Each starts Postgres for as long as it needs it
// when the container's own is not running.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once as onceEvent } from 'node:events';
import {
  exportArchive,
  readArchive,
  restoreArchive,
} from './archive-commands.mjs';
import { Refusal, archiveFileName } from './archive.mjs';
import { messageOf } from './error-message.mjs';
import {
  createRoles,
  isReady,
  postgresArguments,
  prepareCluster,
  volumeInUse,
  waitUntilReady,
} from './embedded-postgres.mjs';
import { ids, minimalEnv, output } from './processes.mjs';
import { resolveAddresses } from './server-mode.mjs';
import { BACKUPS_FOLDER, backupSettings, makeBackup } from './backups.mjs';
import { CONTROL_SOCKET } from './control-server.mjs';
import { existsSync } from 'node:fs';

const env = process.env;
const DATA = env.KOMETIO_DATA_DIR ?? '/data';

const say = (message) => console.error(`[kometio] ${message}`);

/** Runs `work` with a database answering: the container's own, or one started for the length of it. */
async function withDatabase(work, { mustBeStopped }) {
  if (isReady()) {
    if (mustBeStopped) {
      throw new Refusal(
        'Kometio is running on this volume: stop the container first (docker stop), then run the import on the stopped volume',
      );
    }
    return work();
  }
  // Not on files another server has open, which `docker run` cannot see: it is
  // another container, with a process table of its own.
  if (volumeInUse(DATA)) {
    throw new Refusal(
      'this volume is in use by a running Kometio, or was left by one that was not stopped cleanly: stop that container (docker stop), or start it and stop it once, and run this again',
    );
  }
  prepareCluster(DATA, say);
  let said = '';
  const postgres = spawn('postgres', postgresArguments(DATA), {
    ...ids('postgres'),
    env: minimalEnv,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  postgres.stderr.on('data', (chunk) => (said += chunk));
  try {
    await waitUntilReady();
    // Makes the roles and the database when this volume is new; the password is
    // the launcher's to set, at every start.
    createRoles(randomBytes(24).toString('hex'));
    return await work();
  } catch (error) {
    // The server's own account of itself, which is only worth reading when it failed.
    if (!(error instanceof Refusal) && said.trim())
      console.error(said.trim().split('\n').slice(-8).join('\n'));
    throw error;
  } finally {
    postgres.kill('SIGINT'); // Postgres's "fast" shutdown
    await onceEvent(postgres, 'exit');
  }
}

const USAGE = `usage:
  export   writes the site as a .tar.gz on stdout:   docker exec kometio node /opt/kometio/cli.mjs export > ${archiveFileName(new Date())}
  backup   makes a backup now, in /data/backups, as the daily one does (the container has to be running)
  import   opens one, read from stdin, into a new volume (stop the container first)`;

export async function run(command) {
  // The archive is on stdout: whatever else a step prints goes to stderr, and
  // the steps that work say nothing.
  console.log = (...parts) => console.error(...parts);
  output.quiet = true;
  try {
    if (command === 'export') {
      if (process.stdout.isTTY)
        throw new Error(
          `the archive is written to stdout: redirect it to a file (> ${archiveFileName(new Date())})`,
        );
      await withDatabase(
        () => exportArchive({ dataDir: DATA, out: process.stdout, say }),
        { mustBeStopped: false },
      );
    } else if (command === 'backup') {
      // Asked of the running server over its socket, like the editor's export and
      // the daily backup: one at a time, and the same archive. A stopped volume
      // has no server to ask: `docker run … export` is for that.
      if (!existsSync(CONTROL_SOCKET)) {
        throw new Refusal(
          'no Kometio is running in this container to make the backup: start it, or export a stopped volume with `docker run … export`',
        );
      }
      const { keep } = backupSettings(env);
      const made = await makeBackup({
        socketPath: CONTROL_SOCKET,
        directory: `${DATA}/${BACKUPS_FOLDER}`,
        keep,
      });
      say(
        `backup: ${made.path} (${(made.bytes / 1024 / 1024).toFixed(1)} MiB); the ${keep} newest are kept`,
      );
    } else if (command === 'import') {
      if (process.stdin.isTTY)
        throw new Error(
          'the archive is read from stdin: redirect a file into it (< site.tar.gz), with `docker run -i`',
        );
      const { siteUrl } = resolveAddresses(env);
      // The archive is read and judged before any database is started: a file
      // that is not one, or is of a newer Kometio, leaves the volume as it was.
      const archive = await readArchive({
        dataDir: DATA,
        input: process.stdin,
        say,
      });
      try {
        await withDatabase(
          () => restoreArchive({ dataDir: DATA, archive, siteUrl, say }),
          { mustBeStopped: true },
        );
      } finally {
        archive.discard();
      }
    } else {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
  } catch (error) {
    console.error(`[kometio] ${messageOf(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run(process.argv[2]);
}
