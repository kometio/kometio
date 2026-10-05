// Starts everything the single Kometio image holds, in order, and stops it
// all, in reverse, when asked to or when any part dies.
//
//   Postgres  →  migrations  →  API  →  public site  →  editor (nginx)  →  Caddy
//
// Caddy is there only on a server, when DOMAIN is set (docs/adr/0104): it takes
// ports 80 and 443, gets the certificates, and sends each name to its half.
// Without DOMAIN the halves answer on their own ports, as they always did.
//
// Nothing here is product logic: it is the part of the compose stack that a
// container cannot do for you. If one process exits, the others are stopped
// and the container exits too, so that Docker's restart policy brings the
// whole thing back clean rather than leaving half of it running.
//
// Everything that has to survive lives under /data (one volume):
//   postgres/   the embedded database
//   uploads/    the media library
//   secrets/    the key that seals each site's AI provider key (the API's own)
//   state/      what this launcher generated (root only)
//   caddy/      the certificates and the account with the certificate authority
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { get } from 'node:http';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseDomain, serverAddresses } from './server-mode.mjs';

const env = process.env;
const DATA = env.KOMETIO_DATA_DIR ?? '/data';
const SOCKET_DIR = '/run/postgresql';
const PG_DATA = `${DATA}/postgres`;

// No POSTGRES_HOST: this image runs its own database. With one, it uses
// that database, which must already hold the `kometio_app` role (the same
// contract as the compose stack: docs/self-hosting.md).
const OWN_DATABASE = !env.POSTGRES_HOST;

// A server has a name (DOMAIN), and with it HTTPS: the site at the name, the
// editor at admin. and the API at api., as in the compose stack. The three
// addresses below follow from it; any of them can still be set by hand, as
// behind a proxy of one's own, and wins.
let domain = null;
try {
  domain = env.DOMAIN?.trim() ? parseDomain(env.DOMAIN) : null;
} catch (error) {
  console.error(`[kometio] ${error.message}`);
  process.exit(1);
}
const served = domain ? serverAddresses(domain) : null;

// Where the browser reaches each half. Defaults suit `docker run -p
// 3000:3000 -p 4322:4322 -p 4200:80` on one machine; behind a proxy, set
// the three the way docs/self-hosting.md explains.
const EDITOR_URL =
  env.EDITOR_APP_URL ?? served?.editorUrl ?? 'http://localhost:4200';
const API_PUBLIC_URL =
  env.API_PUBLIC_URL ?? served?.apiPublicUrl ?? 'http://localhost:3000/api';
const SITE_URL =
  env.PUBLIC_SITE_URL ?? served?.siteUrl ?? 'http://localhost:4322';

const API_PORT = 3000;
const SITE_PORT = 4322;
// The editor answers on 80 where nothing else does. On a server Caddy has 80,
// and the editor moves to a port only this container can reach.
const EDITOR_PORT = domain ? 8080 : 80;

// A server is production: cookies are `Secure`, and the API refuses the example
// secrets and the test captcha keys, which is what it is for. A trial is not.
const NODE_ENV = env.NODE_ENV ?? (domain ? 'production' : 'development');

/** @type {Array<{ name: string, child: import('node:child_process').ChildProcess, stop: NodeJS.Signals }>} */
const running = [];
let stopping = false;
let setupToken = null;

const log = (message) => console.log(`[kometio] ${message}`);

/** An environment for a process that runs as another user: nothing of root's. */
const minimalEnv = { PATH: env.PATH, HOME: '/tmp', LANG: 'C.UTF-8' };

/** Drops what is `undefined`, which a child process would otherwise receive as the text "undefined". */
const defined = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

function ids(user) {
  const line = readFileSync('/etc/passwd', 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${user}:`));
  if (!line) throw new Error(`no such user: ${user}`);
  const [, , uid, gid] = line.split(':');
  return { uid: Number(uid), gid: Number(gid) };
}

/** Creates a directory owned by `user` the first time; always keeps owner and mode. */
function ensureDir(path, user, mode) {
  const { uid, gid } = ids(user);
  mkdirSync(path, { recursive: true });
  chownSync(path, uid, gid);
  chmodSync(path, mode);
}

function prefixed(stream, name, onLine) {
  createInterface({ input: stream }).on('line', (line) => {
    console.log(`[${name}] ${line}`);
    onLine?.(line);
  });
}

/** A long-running process: stopping it, or its dying, takes the others down. */
function start(
  name,
  command,
  args,
  { user, childEnv = minimalEnv, cwd, stop = 'SIGTERM', onLine } = {},
) {
  const child = spawn(command, args, {
    cwd,
    env: defined(childEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(user ? ids(user) : {}),
  });
  prefixed(child.stdout, name, onLine);
  prefixed(child.stderr, name, onLine);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    log(
      `${name} stopped on its own (${signal ?? `exit ${code}`}): stopping everything`,
    );
    void shutdown(1);
  });
  running.push({ name, child, stop });
  return child;
}

/** A step that must finish before the next one starts. */
function once(
  name,
  command,
  args,
  { user, childEnv = minimalEnv, cwd, input } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env: defined(childEnv),
    input,
    encoding: 'utf8',
    ...(user ? ids(user) : {}),
  });
  for (const line of `${result.stdout ?? ''}${result.stderr ?? ''}`.split(
    '\n',
  )) {
    if (line.trim()) console.log(`[${name}] ${line}`);
  }
  if (result.status !== 0)
    throw new Error(`${name} failed (exit ${result.status})`);
}

async function waitFor(label, probe, seconds) {
  for (let waited = 0; waited < seconds; waited += 1) {
    if (stopping) return;
    if (await probe()) return;
    await sleep(1000);
  }
  throw new Error(`${label} did not come up within ${seconds}s`);
}

const answers = (url) =>
  new Promise((resolve) => {
    get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    }).on('error', () => resolve(false));
  });

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  log('stopping');
  for (const { name, child, stop } of [...running].reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill(stop);
    const exited = new Promise((resolve) => child.once('exit', resolve));
    const gaveUp = sleep(30_000).then(() => 'timeout');
    if ((await Promise.race([exited, gaveUp])) === 'timeout') {
      log(`${name} did not stop in time: killing it`);
      child.kill('SIGKILL');
    }
  }
  process.exit(code);
}

/**
 * The three secrets the stack shares. What the user set wins; what is missing
 * is generated once and kept in /data/state, so it is the same on every
 * start. Only generated values are written down: one the user supplied stays theirs.
 */
function secrets() {
  const path = `${DATA}/state/secrets.json`;
  const generated = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {};
  const fromEnv = {
    postgresAppPassword: env.POSTGRES_APP_PASSWORD,
    previewTokenSecret: env.PREVIEW_TOKEN_SECRET,
    publicApiServiceToken: env.PUBLIC_API_SERVICE_TOKEN,
  };
  const values = {};
  for (const [key, supplied] of Object.entries(fromEnv)) {
    values[key] =
      supplied ?? (generated[key] ??= randomBytes(32).toString('hex'));
  }
  writeFileSync(path, JSON.stringify(generated, null, 2), { mode: 0o600 });
  return values;
}

/** Starts Postgres, and returns what has to be awaited before anything may connect. */
function startEmbeddedDatabase(appPassword) {
  ensureDir(SOCKET_DIR, 'postgres', 0o755);
  ensureDir(PG_DATA, 'postgres', 0o700);

  if (!existsSync(`${PG_DATA}/PG_VERSION`)) {
    log('creating the database (first start)');
    // `local` trusts the socket (reachable only from inside this container);
    // TCP, which the API uses, wants the application role's password.
    once(
      'initdb',
      'initdb',
      [
        '-D',
        PG_DATA,
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

  start(
    'postgres',
    'postgres',
    [
      '-D',
      PG_DATA,
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      `unix_socket_directories=${SOCKET_DIR}`,
    ],
    { user: 'postgres', stop: 'SIGINT' },
  ); // SIGINT is Postgres's "fast" shutdown

  return async () => {
    // `-U postgres`: without it the check connects as the OS user (root), a
    // role that does not exist, and the database logs a FATAL for every probe.
    await waitFor(
      'postgres',
      () =>
        spawnSync('pg_isready', ['-h', SOCKET_DIR, '-U', 'postgres', '-q'])
          .status === 0,
      60,
    );
    // `kometio` owns the schema and runs the migrations (a superuser, as
    // docs/adr/0002 requires, reachable only through the socket); `kometio_app`
    // is what the API connects as, and what row level security applies to.
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
  };
}

function migrate(adminEnv) {
  once('migrate', 'node', ['/opt/kometio/migrate.mjs'], {
    user: 'kometio',
    childEnv: { ...minimalEnv, ...adminEnv },
  });
}

function apiEnvironment(s) {
  // The user's own variables win over the defaults, so a deployment can set
  // SMTP, S3, its own Turnstile keys, NODE_ENV=production, and so on. The
  // database administrator's credentials stay out of the API's reach.
  const { POSTGRES_USER, POSTGRES_PASSWORD, ...userEnv } = env;
  void POSTGRES_USER;
  void POSTGRES_PASSWORD;
  return {
    NODE_ENV,
    PORT: String(API_PORT),
    // Caddy is one hop in front of the API on a server, and every limit per
    // visitor (five logins a minute, the forms) keys on who the visitor is: with
    // none, every visitor would be Caddy, and one could lock everybody out.
    ...(domain ? { TRUSTED_PROXY_HOPS: '1' } : {}),
    PREVIEW_TOKEN_SECRET: s.previewTokenSecret,
    PUBLIC_API_SERVICE_TOKEN: s.publicApiServiceToken,
    EDITOR_APP_URL: EDITOR_URL,
    API_PUBLIC_URL,
    // No SMTP_* here: without a mail server the API writes each email (an
    // invitation, a password reset) to its log, link included. Set SMTP_* to
    // a real server to send them (docs/adr/0103).
    MEDIA_UPLOAD_DIR: `${DATA}/uploads`,
    THEMES_DIR: '/opt/api/themes',
    KOMETIO_SECRETS_DIR: `${DATA}/secrets`,
    // No TURNSTILE_* either: with neither key the captcha is the one built into
    // Kometio, which needs no account and no network. Both of a site's own keys
    // switch to Cloudflare's (docs/adr/0103), through `userEnv` below.
    ...userEnv,
    HOME: '/tmp',
    // These are this launcher's to decide, whatever the environment says.
    POSTGRES_APP_PASSWORD: s.postgresAppPassword,
    ...(OWN_DATABASE ? { POSTGRES_HOST: '127.0.0.1' } : {}),
  };
}

function siteEnvironment(s) {
  // Not the whole environment: this server runs the code of a theme, so it
  // gets exactly what it reads, as in the compose stack. An empty value is
  // "not set" to each optional one.
  return {
    ...minimalEnv,
    PORT: String(SITE_PORT),
    API_URL: `http://127.0.0.1:${API_PORT}/api`,
    EDITOR_APP_URL: EDITOR_URL,
    API_PUBLIC_URL,
    PUBLIC_API_SERVICE_TOKEN: s.publicApiServiceToken,
    TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY ?? '',
    KOMETIO_THEME: env.KOMETIO_THEME ?? '',
    S3_MEDIA_PUBLIC_BASE_URL: env.S3_MEDIA_PUBLIC_BASE_URL ?? '',
  };
}

/** The editor's two addresses and its policy header, from the editor image's own files. */
function configureEditor() {
  const editorEnv = {
    PATH: env.PATH,
    KOMETIO_API_URL: API_PUBLIC_URL,
    KOMETIO_PUBLIC_SITE_URL: SITE_URL,
    // Empty: no Turnstile keys, and the editor draws the captcha built into Kometio (docs/adr/0103).
    KOMETIO_TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY ?? '',
  };
  // The same script the editor image runs at its start: it writes /config.js
  // and works out the API's origin for the policy.
  const script = spawnSync(
    'sh',
    [
      '-c',
      '. /opt/kometio/editor-runtime-config.envsh >/dev/null && printf %s "$KOMETIO_API_ORIGIN"',
    ],
    { env: editorEnv, encoding: 'utf8' },
  );
  if (script.status !== 0)
    throw new Error(`editor configuration failed: ${script.stderr}`);
  const values = { ...editorEnv, KOMETIO_API_ORIGIN: script.stdout };
  const rendered = readFileSync(
    '/opt/kometio/editor.conf.template',
    'utf8',
  ).replace(/\$\{(KOMETIO_[A-Z_]+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`the editor template needs ${name}`);
    return values[name];
  });
  // The template is the editor image's own and listens on 80, which is right for
  // a trial. On a server the editor listens on a loopback port instead, for
  // Caddy; the line is changed here rather than the template forked, and a
  // template that no longer has it is an error, not a silent 80.
  let listening = rendered;
  if (EDITOR_PORT !== 80) {
    listening = rendered.replace(
      /^(\s*)listen 80;/m,
      `$1listen 127.0.0.1:${EDITOR_PORT};`,
    );
    if (listening === rendered) {
      throw new Error(
        "the editor's template no longer has a `listen 80;` to move",
      );
    }
  }
  writeFileSync('/etc/nginx/http.d/default.conf', listening);
  mkdirSync('/run/nginx', { recursive: true });
}

/**
 * The proxy of a server: ports 80 and 443, a certificate for each name, and
 * each name sent to its half. It runs the same Caddyfile as the compose stack,
 * told by its environment where the three halves are (and with its admin API
 * off, which a theme's code, running in this container, must not reach).
 */
async function startCaddy() {
  ensureDir(`${DATA}/caddy`, 'caddy', 0o700);
  start('caddy', 'caddy', ['run', '--config', '/opt/kometio/Caddyfile'], {
    user: 'caddy',
    childEnv: {
      PATH: env.PATH,
      HOME: '/tmp',
      // Where Caddy keeps its certificates and its account: the volume, so that
      // a restart does not ask the certificate authority again (it limits how
      // often it will issue for a name).
      XDG_DATA_HOME: `${DATA}/caddy`,
      XDG_CONFIG_HOME: '/tmp/caddy',
      DOMAIN: domain,
      SITE_UPSTREAM: `127.0.0.1:${SITE_PORT}`,
      EDITOR_UPSTREAM: `127.0.0.1:${EDITOR_PORT}`,
      API_UPSTREAM: `127.0.0.1:${API_PORT}`,
      KOMETIO_CADDY_OPTIONS: 'admin off\nskip_install_trust',
      KOMETIO_ACME_EMAIL_LINE: env.ACME_EMAIL ? `email ${env.ACME_EMAIL}` : '',
    },
  });
  // Up when it answers on 80, which is before it has every certificate: the
  // first visit to a name waits for its own if it has to.
  await waitFor('Caddy', () => answers('http://127.0.0.1:80/'), 30);
}

function announce() {
  const line = '─'.repeat(64);
  console.log(`\n${line}\n  Kometio is ready\n`);
  console.log(`  Editor      ${EDITOR_URL}`);
  console.log(`  Your site   ${SITE_URL}`);
  if (domain) {
    console.log(
      `\n  HTTPS: certificates are being obtained for ${domain}, www.${domain},\n  admin.${domain} and api.${domain}. If a browser warns, the DNS of those\n  names does not point at this machine yet; docker logs shows the attempts.`,
    );
  }
  if (setupToken) {
    console.log(
      '\n  First time here? Open the editor and enter this setup token:',
    );
    console.log(`\n      ${setupToken}\n`);
  }
  console.log(`${line}\n`);
}

async function main() {
  log(
    `starting (${NODE_ENV}${OWN_DATABASE ? ', with its own database' : `, database at ${env.POSTGRES_HOST}`})`,
  );
  if (domain) {
    log(
      `serving ${domain} over HTTPS (the editor at admin.${domain}, the API at api.${domain}): its DNS has to point at this machine for the certificates to be issued`,
    );
  }

  ensureDir(DATA, 'root', 0o755);
  ensureDir(`${DATA}/state`, 'root', 0o700);
  ensureDir(`${DATA}/uploads`, 'kometio', 0o755);
  ensureDir(`${DATA}/secrets`, 'kometio', 0o700);
  const s = secrets();

  let adminEnv;
  if (OWN_DATABASE) {
    const ready = startEmbeddedDatabase(s.postgresAppPassword);
    await ready();
    adminEnv = {
      POSTGRES_HOST: SOCKET_DIR,
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'kometio',
      POSTGRES_DB: 'kometio',
    };
  } else {
    adminEnv = {
      POSTGRES_HOST: env.POSTGRES_HOST,
      POSTGRES_PORT: env.POSTGRES_PORT ?? '5432',
      POSTGRES_USER: env.POSTGRES_USER,
      POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
      POSTGRES_DB: env.POSTGRES_DB ?? 'kometio',
    };
  }
  migrate(adminEnv);

  let expectingToken = false;
  start('api', 'node', ['main.js'], {
    user: 'kometio',
    cwd: '/opt/api',
    childEnv: apiEnvironment(s),
    onLine: (line) => {
      // The API prints the first-run token once, in a box, and keeps it in
      // memory only: this is the one place it can be picked up and shown plainly.
      if (line.includes('enter this setup token')) {
        expectingToken = true;
        return;
      }
      const token =
        expectingToken && line.match(/^\s{4,}([A-Za-z0-9_-]{20,})\s*$/);
      if (token) {
        setupToken = token[1];
        expectingToken = false;
      }
    },
  });
  await waitFor(
    'the API',
    () => answers(`http://127.0.0.1:${API_PORT}/api/health`),
    120,
  );

  start('site', 'node', ['server.mjs'], {
    user: 'kometio-site',
    cwd: '/opt/site',
    childEnv: siteEnvironment(s),
  });
  await waitFor(
    'the public site',
    () => answers(`http://127.0.0.1:${SITE_PORT}/api/health`),
    60,
  );

  configureEditor();
  start('editor', 'nginx', ['-c', '/opt/kometio/nginx.conf']);
  await waitFor(
    'the editor',
    () => answers(`http://127.0.0.1:${EDITOR_PORT}/`),
    30,
  );

  if (domain) {
    await startCaddy();
  }

  announce();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => void shutdown(0));
}

main().catch((error) => {
  console.error(`[kometio] ${error.message}`);
  void shutdown(1);
});
