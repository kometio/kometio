// The database inside the image: where it lives, how it is made the first
// time, and how it is started and told who may use it. The launcher runs it for
// as long as the container lives; the archive commands run it for as long as
// one export or one import takes.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ensureDir, once, waitFor } from './processes.mjs';

export const SOCKET_DIR = '/run/postgresql';

export const pgData = (dataDir) => `${dataDir}/postgres`;

/** What the server is started with: only this container can reach it, by TCP on loopback and by the socket. */
export const postgresArguments = (dataDir) => [
  '-D',
  pgData(dataDir),
  '-c',
  'listen_addresses=127.0.0.1',
  '-c',
  `unix_socket_directories=${SOCKET_DIR}`,
];

/**
 * Whether a postmaster has this volume's data directory open: it leaves
 * `postmaster.pid` there for as long as it runs, and removes it on a clean stop.
 * It is what tells a second container that mounts the same volume that the first
 * is in the middle of it, which nothing else can: a pid file written by a process
 * in another container names a process this one cannot see, so Postgres itself
 * takes it for stale, deletes it and starts a second server on the same files.
 * (A crash leaves it too; start the container and stop it cleanly to clear it.)
 */
export const volumeInUse = (dataDir) =>
  existsSync(`${pgData(dataDir)}/postmaster.pid`);

/** Makes the cluster the first time. */
export function prepareCluster(dataDir, log) {
  ensureDir(SOCKET_DIR, 'postgres', 0o755);
  ensureDir(pgData(dataDir), 'postgres', 0o700);

  if (!existsSync(`${pgData(dataDir)}/PG_VERSION`)) {
    log('creating the database (first start)');
    // `local` trusts the socket (reachable only from inside this container);
    // TCP, which the API uses, wants the application role's password.
    once(
      'initdb',
      'initdb',
      [
        '-D',
        pgData(dataDir),
        '-U',
        'postgres',
        '-E',
        'UTF8',
        '--locale=C.UTF-8',
        '--auth-local=trust',
        '--auth-host=scram-sha-256',
      ],
      { user: 'postgres' },
    );
  }
}

/** Whether a server is answering on the socket: `-U postgres`, or the check connects as root and the database logs a FATAL for every probe. */
export const isReady = () =>
  spawnSync('pg_isready', ['-h', SOCKET_DIR, '-U', 'postgres', '-q']).status ===
  0;

export const waitUntilReady = (shouldStop) =>
  waitFor('postgres', isReady, 60, shouldStop);

/**
 * `kometio` owns the schema and runs the migrations (a superuser, as
 * docs/adr/0002 requires, reachable only through the socket); `kometio_app` is
 * what the API connects as, and what row level security applies to.
 */
export function createRoles(appPassword) {
  once(
    'postgres-setup',
    'psql',
    [
      '-h',
      SOCKET_DIR,
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `app_password=${appPassword}`,
    ],
    {
      user: 'postgres',
      input: [
        "select 'create role kometio superuser login' where not exists (select from pg_roles where rolname = 'kometio') \\gexec",
        "select format('create role kometio_app login password %L', :'app_password') where not exists (select from pg_roles where rolname = 'kometio_app') \\gexec",
        "select 'create database kometio owner kometio' where not exists (select from pg_database where datname = 'kometio') \\gexec",
        // Keeps the role in step with the secret on every start.
        "alter role kometio_app password :'app_password';",
      ].join('\n'),
    },
  );
}
