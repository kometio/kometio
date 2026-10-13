// Makes a site archive from this installation, and opens one into it
// (docs/adr/0105). What an archive is and when to trust one is archive.mjs;
// this is the part that runs programs: pg_dump, psql, tar. It assumes a
// database is answering on the socket, and says nothing on stdout when it is
// writing an archive there (everything it has to say goes to stderr).
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  chownSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { DATABASE_USER, SOCKET_DIR } from './embedded-postgres.mjs';
import { ensureDir, ids, minimalEnv, once } from './processes.mjs';
import {
  TRANSIENT_TABLES,
  ARCHIVE_LIMITS,
  appliedMigrationTags,
  archiveFileName,
  buildManifest,
  checkCompatible,
  checkEntries,
  checkExtractedTree,
  domainOfAddress,
  Refusal,
  parseManifest,
  roomForArchive,
  roomForUnpacked,
} from './archive.mjs';

/**
 * A stream that passes what it is given and fails, with a `Refusal`, once more
 * than `max` bytes have gone through (docs/adr/0120): the body of a request
 * that has no end is not written to the disk until the disk is full.
 */
export function limitedBytes(max, what) {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length;
      if (seen > max) callback(new Refusal(what));
      else callback(null, chunk);
    },
  });
}

/** What is left on the volume `dir` is on, for a process that is not root's. */
const freeBytes = (dir) => {
  const { bavail, bsize } = statfsSync(dir);
  return bavail * bsize;
};

// The migrations the running code has, in the order it applies them.
const JOURNAL =
  '/opt/api/workspace_modules/@kometio/postgres-db/drizzle/meta/_journal.json';

const readJournal = () => ({
  entries: JSON.parse(readFileSync(JOURNAL, 'utf8')).entries,
});

/** psql as the database's administrator, over the socket; what it prints, or what it said when it failed. */
function psql(database, args, input) {
  const result = spawnSync(
    'psql',
    [
      // No `.psqlrc`: this one runs as root, with statements of our own.
      '-X',
      '-h',
      SOCKET_DIR,
      '-U',
      'kometio',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    { encoding: 'utf8', input },
  );
  if (result.status !== 0) {
    throw new Error(
      `psql failed: ${(result.stderr || result.stdout).trim().split('\n').slice(-5).join(' / ')}`,
    );
  }
  return result.stdout;
}

/** One value, as the JSON a query makes of it. */
const queryJson = (database, sql) =>
  JSON.parse(psql(database, ['-At', '-c', sql]).trim() || 'null');

function filesIn(directory) {
  if (!existsSync(directory)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    files += 1;
    bytes += statSync(`${entry.parentPath}/${entry.name}`).size;
  }
  return { files, bytes };
}

const mebibytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Waits for a child to end; false when it ended badly, with what it said. */
const ended = (child) =>
  new Promise((resolve) => {
    let said = '';
    child.stderr?.on('data', (chunk) => (said += chunk));
    child.once('error', (error) => resolve({ ok: false, said: error.message }));
    child.once('close', (code) =>
      resolve({ ok: code === 0, said: said.trim() }),
    );
  });

/** pg_dump of this installation's database, gzipped, into `file`. */
async function dumpDatabaseTo(file) {
  const dump = spawn(
    'pg_dump',
    [
      '-h',
      SOCKET_DIR,
      '-U',
      'kometio',
      '-d',
      'kometio',
      // The owner is whoever restores it, and the grants to the application
      // role stay: they are what makes row level security apply to it.
      '--no-owner',
      ...TRANSIENT_TABLES.map(
        (table) => `--exclude-table-data=public.${table}`,
      ),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: minimalEnv },
  );
  const done = ended(dump);
  await pipeline(dump.stdout, createGzip(), createWriteStream(file));
  const dumped = await done;
  if (!dumped.ok) throw new Error(`pg_dump failed: ${dumped.said}`);
}

/** The folder `stage`, as a .tar.gz, to `out` (a writable stream that the caller ends). Links are followed: that is how the uploads are read where they are. */
async function tarTo(stage, out) {
  // Run as the API's user: the uploads folder is its own, and a link in it can
  // point at any file of the machine, which tar follows (`-h`). Read as root it
  // would write into the archive a file that only root can read; read as this
  // user it can read what this user could read anyway, and a link to anything
  // else is a refusal (docs/adr/0109).
  const { uid, gid } = ids('kometio');
  const tar = spawn('tar', ['czhf', '-', '-C', stage, '.'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    uid,
    gid,
  });
  const archived = ended(tar);
  try {
    // `end: false`: what is written to is the caller's, and it ends it.
    await pipeline(tar.stdout, out, { end: false });
  } catch (error) {
    // Whoever was reading has gone: no more archive to make.
    tar.kill();
    throw error;
  }
  const tarred = await archived;
  if (!tarred.ok) throw new Error(`tar failed: ${tarred.said}`);
}

/**
 * Gets the archive of this installation ready to be written, and refuses now what
 * can be refused: there has to be a site to export. What it returns is the name
 * the file should have, `write(out)`, which makes the archive and writes it to a
 * writable stream, and `discard()`, which removes what `write` left on the disk
 * and has to be called whether it worked or not.
 *
 * The archive is: the database as pg_dump gives it, without what only describes a
 * moment; the uploads as they are; and a manifest that says what it is. Safe to
 * make while the server is up, because pg_dump reads one consistent snapshot.
 * Nothing is dumped before `write`, so a caller that answers somebody can answer
 * a refusal as one, and start the answer before the dump, which takes the time
 * the database takes.
 */
export async function prepareExport({ dataDir, say }) {
  const createdAt = new Date();
  const site = queryJson(
    'kometio',
    `select row_to_json(s) from (select name, domain, default_locale as "defaultLocale", enabled_locales as "enabledLocales" from sites order by name limit 1) s`,
  );
  if (!site) {
    throw new Refusal(
      'there is no site to export: this installation has not been set up yet',
    );
  }
  const appliedWhen = queryJson(
    'kometio',
    `select coalesce(json_agg(created_at order by created_at), '[]'::json) from drizzle.__drizzle_migrations`,
  );
  const migrations = appliedMigrationTags(readJournal(), appliedWhen);
  const uploadsDir = `${dataDir}/uploads`;
  const uploads = filesIn(uploadsDir);

  let stage = null;
  let written = false;

  async function write(out) {
    if (written) throw new Error('an archive is written once');
    written = true;
    // Where the API's user can reach it: tar is run as that user, and `state/`
    // is root's. The folder stays root's own and is readable by that user's
    // group and by nobody else, so the user cannot put anything in it for root
    // to write over or to remove, and the site's user cannot read the dump.
    const exports = `${dataDir}/exports`;
    ensureDir(exports, 'root', 0o755);
    // Its own name each time: a leftover of a crash is never in the way.
    stage = mkdtempSync(`${exports}/export-`);
    chownSync(stage, 0, ids('kometio').gid);
    chmodSync(stage, 0o750);

    say(
      `dumping the database (${TRANSIENT_TABLES.length} tables keep their structure and lose their rows)`,
    );
    await dumpDatabaseTo(`${stage}/database.sql.gz`);

    writeFileSync(
      `${stage}/manifest.json`,
      `${JSON.stringify(buildManifest({ createdAt, site, migrations, uploads }), null, 2)}\n`,
    );
    // The uploads are not copied: tar follows this link (`-h`) and reads them where they are.
    ensureDir(uploadsDir, 'kometio', 0o755);
    symlinkSync(uploadsDir, `${stage}/uploads`);

    say(
      `writing the archive: ${uploads.files} uploaded files (${mebibytes(uploads.bytes)})`,
    );
    await tarTo(stage, out);
    say(
      `done: the site "${site.name}" (${site.domain ?? 'no domain'}), ${migrations.length} migrations, treat the file as a password: it holds the accounts' password hashes`,
    );
  }

  const discard = () => {
    if (stage !== null) rmSync(stage, { recursive: true, force: true });
  };

  return { fileName: archiveFileName(createdAt), write, discard };
}

/** `prepareExport`, written to `out` (a writable stream) and cleaned up: what a command does. */
export async function exportArchive({ dataDir, out, say }) {
  const archive = await prepareExport({ dataDir, say });
  try {
    await archive.write(out);
  } finally {
    archive.discard();
  }
}

/** Removes what exports left when their process died: the dump of a database is not to be found lying there a month later. Only for the server's own start, when no other export can be running. (`state/` is where earlier versions made them.) */
export function removeLeftoverExports(dataDir) {
  for (const folder of [`${dataDir}/exports`, `${dataDir}/state`]) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) {
      if (name.startsWith('export-')) {
        rmSync(`${folder}/${name}`, { recursive: true, force: true });
      }
    }
  }
}

/** Every path under `root`, as `lstat` sees it (links are not followed): `{ name, kind, links }`. */
function describeTree(root, relative = '') {
  const entries = [];
  for (const name of readdirSync(`${root}/${relative}`)) {
    const path = relative === '' ? name : `${relative}/${name}`;
    const stat = lstatSync(`${root}/${path}`);
    if (stat.isDirectory()) {
      entries.push({ name: path, kind: 'directory', links: stat.nlink });
      entries.push(...describeTree(root, path));
    } else {
      entries.push({
        name: path,
        kind: stat.isFile() ? 'file' : 'other',
        links: stat.nlink,
      });
    }
  }
  return entries;
}

/**
 * Reads an archive from `input`, a stream, and decides whether it can be opened
 * here, before anything is touched: that it is an archive at all and holds
 * nothing but what an archive holds, and that this version of Kometio can open
 * it. It needs no database. What it returns is where the archive was unpacked, and
 * `discard` removes that.
 */
export async function readArchive({ dataDir, input, say }) {
  const stage = `${dataDir}/state/import-${process.pid}`;
  ensureDir(stage, 'root', 0o700);
  const discard = () => rmSync(stage, { recursive: true, force: true });
  try {
    say('reading the archive');
    // Never more than the volume has room for, kept once as it came and once
    // unpacked: a request that does not end is refused when it passes that, and
    // what it wrote goes with the stage.
    const incomingMax = roomForArchive(freeBytes(dataDir));
    await pipeline(
      input,
      limitedBytes(
        incomingMax,
        `this archive is larger than this volume has room to open (${(incomingMax / 1024 ** 3).toFixed(1)} GiB, with room kept for the database and for it to be unpacked): it is refused`,
      ),
      createWriteStream(`${stage}/incoming.tar.gz`),
    );

    // `maxBuffer`: the default, 1 MiB, is a listing of some eight thousand
    // files, and a site with more would be told that it is not a .tar.gz.
    const listing = spawnSync('tar', ['tvzf', `${stage}/incoming.tar.gz`], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (listing.status !== 0) {
      throw new Refusal(
        'this is not a Kometio site archive: it is not a .tar.gz',
      );
    }
    // What it declares, against what the volume has left now that it is here.
    checkEntries(listing.stdout, {
      entries: ARCHIVE_LIMITS.entries,
      bytes: roomForUnpacked(freeBytes(dataDir)),
    });

    ensureDir(`${stage}/content`, 'root', 0o700);
    const unpacked = spawnSync(
      'tar',
      [
        'xzf',
        `${stage}/incoming.tar.gz`,
        '-C',
        `${stage}/content`,
        // Busybox's tar: do not restore the owners the archive names.
        '-o',
      ],
      { encoding: 'utf8' },
    );
    if (unpacked.status !== 0)
      throw new Error(`tar failed: ${unpacked.stderr.trim()}`);
    const content = `${stage}/content`;
    // The listing said what the archive holds; this says what came out of it.
    checkExtractedTree(describeTree(content));

    const manifest = parseManifest(
      readFileSync(`${content}/manifest.json`, 'utf8'),
    );
    const known = readJournal().entries.map((entry) => entry.tag);
    checkCompatible(manifest, known);
    say(
      `an archive of the site "${manifest.site.name}", made ${manifest.createdAt}`,
    );
    return { content, manifest, known, discard };
  } catch (error) {
    discard();
    throw error;
  }
}

const ALREADY_HAS_A_SITE =
  'this installation already has a site: an archive is opened into a new volume, never over a site';

/** Whether a site has been made here: the tables are there and a tenant is in them. */
export function installationHasSite() {
  // Two queries: one that names `tenants` is refused at parse time when the table is not there.
  const hasTenantsTable = queryJson(
    'kometio',
    "select to_json(to_regclass('public.tenants') is not null)",
  );
  return (
    hasTenantsTable &&
    queryJson('kometio', 'select to_json(exists (select 1 from tenants))')
  );
}

/**
 * Opens an archive that `readArchive` accepted into this installation, which
 * has to be new: no site yet and no uploaded file. The server must not be
 * running (the caller has seen to that). The database is made again from the
 * dump, the migrations the archive lacks run, and then what does not belong to a
 * copy is put right: the site takes the address this installation is reached at,
 * and the AI provider's key, sealed with a key that stayed behind, is forgotten.
 */
export async function restoreArchive({
  dataDir,
  archive: { content, manifest, known },
  siteUrl,
  say,
}) {
  // Only a new installation: nothing here may be thrown away to make room.
  const uploadsDir = `${dataDir}/uploads`;
  if (existsSync(uploadsDir) && readdirSync(uploadsDir).length > 0) {
    throw new Refusal(
      `${uploadsDir} already has files: an archive is opened into a new volume, never over a site`,
      { conflict: true },
    );
  }
  if (installationHasSite()) {
    throw new Refusal(ALREADY_HAS_A_SITE, { conflict: true });
  }

  try {
    await restoreInto({ dataDir, content, manifest, known, siteUrl, say });
  } catch (error) {
    // The installation was new when this began, so putting it back as it was
    // is not throwing anything away: a half-opened site (a restore that came
    // through and a migration that did not, files copied and no room for the
    // rest) would otherwise be refused as "already a site" at the next try, and
    // be what the server starts on.
    resetToNew(uploadsDir, say);
    throw error;
  }
}

/** The database and the uploads as a new installation has them: no site, no file. */
function resetToNew(uploadsDir, say) {
  try {
    psql('postgres', [
      '-c',
      'drop database if exists kometio',
      '-c',
      'create database kometio owner kometio',
    ]);
    if (existsSync(uploadsDir)) {
      for (const entry of readdirSync(uploadsDir)) {
        rmSync(`${uploadsDir}/${entry}`, { recursive: true, force: true });
      }
    }
  } catch (error) {
    say(`the installation could not be put back as it was: ${error.message}`);
  }
}

async function restoreInto({
  dataDir,
  content,
  manifest,
  known,
  siteUrl,
  say,
}) {
  const uploadsDir = `${dataDir}/uploads`;

  say('restoring the database');
  psql('postgres', [
    '-c',
    'drop database if exists kometio',
    '-c',
    'create database kometio owner kometio',
  ]);
  const gunzip = spawn('gunzip', ['-c', `${content}/database.sql.gz`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // The dump is SQL that someone else wrote, and psql runs more than SQL: `\!`
  // is a shell, as whoever runs psql. This is the database's own user, which
  // already is what `COPY … PROGRAM` is run as, and not root, who has the keys
  // and the secrets of this installation. `-X` leaves out a `.psqlrc`. What the
  // dump says is still run as the database's administrator: an archive is as
  // trusted as an installer is (docs/adr/0108).
  const { uid, gid } = ids(DATABASE_USER);
  const restore = spawn(
    'psql',
    [
      '-X',
      '-h',
      SOCKET_DIR,
      '-U',
      'kometio',
      '-d',
      'kometio',
      '-q',
      '--single-transaction',
      '-v',
      'ON_ERROR_STOP=1',
      '-o',
      '/dev/null',
    ],
    { stdio: ['pipe', 'ignore', 'pipe'], env: minimalEnv, uid, gid },
  );
  const gunzipped = ended(gunzip);
  const restored = ended(restore);
  await pipeline(gunzip.stdout, restore.stdin);
  const [unzipResult, restoreResult] = await Promise.all([gunzipped, restored]);
  if (!unzipResult.ok)
    throw new Error(
      `the database in the archive could not be read: ${unzipResult.said}`,
    );
  if (!restoreResult.ok)
    throw new Error(
      `the database could not be restored (nothing was changed): ${restoreResult.said.split('\n').slice(-3).join(' / ')}`,
    );

  const pending = known.length - manifest.migrations.length;
  say(
    pending > 0
      ? `bringing the database up to this version (${pending} migrations)`
      : 'the database is at this version',
  );
  once('migrate', 'node', ['/opt/kometio/migrate.mjs'], {
    // Over the socket, which only root and the database's own user may open.
    user: DATABASE_USER,
    childEnv: {
      ...minimalEnv,
      POSTGRES_HOST: SOCKET_DIR,
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'kometio',
      POSTGRES_DB: 'kometio',
    },
  });

  const domain = domainOfAddress(siteUrl);
  psql(
    'kometio',
    ['-q', '-v', `domain=${domain ?? ''}`],
    [
      // The name visitors type: the one this installation is reached at, not the one of the server the archive came from.
      domain === null
        ? 'update sites set domain = null;'
        : "update sites set domain = :'domain';",
      // Sealed with the key of the other server, which is not here: the key is asked for again.
      'update site_ai_settings set api_key_sealed = null, api_key_hint = null;',
    ].join('\n'),
  );

  if (existsSync(`${content}/uploads`)) {
    ensureDir(uploadsDir, 'kometio', 0o755);
    const copied = spawnSync('cp', [
      '-a',
      `${content}/uploads/.`,
      `${uploadsDir}/`,
    ]);
    if (copied.status !== 0)
      throw new Error(
        `the uploaded files could not be copied: ${copied.stderr}`,
      );
    spawnSync('chown', ['-R', 'kometio:kometio', uploadsDir]);
  }

  say(
    `done: the site "${manifest.site.name}" is here, at ${domain ?? 'no domain (set it in Settings → General)'}; its accounts, pages and ${manifest.uploads?.files ?? 0} uploaded files came with it; nobody is signed in, and the AI provider's key has to be entered again`,
  );
}
