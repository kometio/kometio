// Starts everything the single Kometio image holds, in order, and stops it
// all, in reverse, when asked to or when any part dies.
//
//   Postgres  →  migrations  →  API  →  public site  →  editor (nginx)  →  Caddy
//
// Beside them, with its own database, the launcher itself answers the API on a
// socket: the archive of the site, for Settings → Export (docs/adr/0105), and the
// opening of one into an installation with no site yet, from the first-run screen
// (docs/adr/0106), which stops the API and the site, restores, and starts them again.
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
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { get } from 'node:http';
import {
  installationHasSite,
  prepareExport,
  readArchive,
  removeLeftoverExports,
  restoreArchive,
} from './archive-commands.mjs';
import { CONTROL_SOCKET, startControlServer } from './control-server.mjs';
import {
  DATABASE_USER,
  SOCKET_DIR,
  createRoles,
  postgresArguments,
  prepareCluster,
  waitUntilReady,
} from './embedded-postgres.mjs';
import { ProcessSupervisor } from './process-supervisor.mjs';
import {
  ensureDir,
  ids,
  log,
  minimalEnv,
  once,
  waitFor as waitForProcess,
} from './processes.mjs';
import {
  innerPorts,
  proxyAdvice,
  proxyDefaults,
  resolveAddresses,
} from './server-mode.mjs';
import {
  apiEnvironment,
  caddyEnvironment,
  databaseAdministrator,
  renderEditorConfig,
  resolveSecrets,
  siteEnvironment,
} from './service-environments.mjs';
import { IMPORT_RESULT_FILE, createSiteImport } from './site-import.mjs';

const env = process.env;
const DATA = env.KOMETIO_DATA_DIR ?? '/data';

// No POSTGRES_HOST: this image runs its own database. With one, it uses
// that database, which must already hold the `kometio_app` role (the same
// contract as the compose stack: docs/self-hosting.md).
const OWN_DATABASE = !env.POSTGRES_HOST;

// A server has a name (DOMAIN), and with it HTTPS: the site at the name, the
// editor at admin. and the API at api., as in the compose stack. The three
// addresses below follow from it; any of them can still be set by hand, as
// behind a proxy of one's own, and wins.
let addresses;
try {
  addresses = resolveAddresses(env);
} catch (error) {
  console.error(`[kometio] ${error.message}`);
  process.exit(1);
}
// Where the browser reaches each half. Defaults suit `docker run -p
// 3000:3000 -p 4322:4322 -p 4200:80` on one machine; behind a proxy, set
// the three the way docs/self-hosting.md explains.
const {
  domain,
  editorUrl: EDITOR_URL,
  apiPublicUrl: API_PUBLIC_URL,
  siteUrl: SITE_URL,
} = addresses;

const PORTS = innerPorts(domain);
const API_PORT = PORTS.api;
const SITE_PORT = PORTS.site;
// The editor answers on 80 where nothing else does. On a server Caddy has 80,
// and the editor moves to a port only this container can reach.
const EDITOR_PORT = PORTS.editor;

// A server is production: cookies are `Secure`, and the API refuses the example
// secrets and the test captcha keys, which is what it is for. A trial is not.
// An installation behind a proxy of its own that ends the TLS is production too,
// whatever it was started with: what shows it is an address that is https. How
// many proxies stand in front is not guessed for it (docs/adr/0110).
const PROXY = proxyDefaults(addresses);
const NODE_ENV = env.NODE_ENV ?? PROXY.nodeEnv;

/** The long-running processes: one that stops on its own takes the others down (process-supervisor.mjs). */
const supervisor = new ProcessSupervisor();
let setupToken = null;

/** Waits for something to come up, and stops waiting when the launcher is stopping. */
const waitFor = (label, probe, seconds) =>
  waitForProcess(label, probe, seconds, () => supervisor.stopping);

const answers = (url) =>
  new Promise((resolve) => {
    get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    }).on('error', () => resolve(false));
  });

/**
 * The three secrets the stack shares, from the environment and from what an
 * earlier start generated and kept in /data/state (service-environments.mjs
 * says which wins).
 */
function secrets() {
  const path = `${DATA}/state/secrets.json`;
  const stored = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const { values, kept } = resolveSecrets({
    env,
    stored,
    generate: () => randomBytes(32).toString('hex'),
  });
  writeFileSync(path, JSON.stringify(kept, null, 2), { mode: 0o600 });
  return values;
}

/** Starts Postgres, and returns what has to be awaited before anything may connect. */
function startEmbeddedDatabase(appPassword) {
  prepareCluster(DATA, log);

  supervisor.start('postgres', 'postgres', postgresArguments(DATA), {
    user: 'postgres',
    stop: 'SIGINT',
  }); // SIGINT is Postgres's "fast" shutdown

  return async () => {
    await waitUntilReady(() => supervisor.stopping);
    createRoles(appPassword);
  };
}

function migrate(adminEnv) {
  once('migrate', 'node', ['/opt/kometio/migrate.mjs'], {
    // The embedded database's socket is closed to the API's user (docs/adr/0107):
    // the migrator, which is its administrator, runs as the database's own.
    // With a database elsewhere it goes over the network, as it always has.
    user: OWN_DATABASE ? DATABASE_USER : 'kometio',
    childEnv: { ...minimalEnv, ...adminEnv },
  });
}

/**
 * Answers the API on a socket that only its user can open. It makes the archive
 * of the site from this container's own database, and opens one into it, which
 * is what the API is not given the means to do; with a database elsewhere there
 * is nothing here to dump or to restore.
 *
 * Opening an archive stops the site and the API, which hold the database and
 * remember that there is no site, restores, and starts them again (the
 * migrations first: a restore that failed has left an empty database, and an
 * empty database has no tables). How it went is written next to the socket, where
 * the API, once it is back, tells the browser that is waiting.
 */
async function startControl(s, adminEnv) {
  removeLeftoverExports(DATA);
  const owner = ids('kometio');
  await startControlServer({
    socketPath: CONTROL_SOCKET,
    owner,
    prepare: () => prepareExport({ dataDir: DATA, say: log }),
    openArchive: createSiteImport({
      dataDir: DATA,
      siteUrl: SITE_URL,
      resultPath: `${dirname(CONTROL_SOCKET)}/${IMPORT_RESULT_FILE}`,
      owner,
      say: log,
      installationHasSite,
      readArchive,
      restoreArchive,
      stopServers: async () => {
        await supervisor.stopOne('site');
        await supervisor.stopOne('api');
      },
      startServers: async () => {
        if (supervisor.stopping) return;
        // The token the first start showed belongs to an API that is gone: a new
        // one is shown, if this one makes one (it does when the import failed).
        setupToken = null;
        migrate(adminEnv);
        await startApi(s);
        await startSite(s);
        // The same banner as at the start, since what a person needs next is the
        // same: where things are, and the new setup token after a failure.
        announce();
      },
    }),
    say: log,
  });
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
  const listening = renderEditorConfig({
    template: readFileSync('/opt/kometio/editor.conf.template', 'utf8'),
    values,
    editorPort: EDITOR_PORT,
  });
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
  supervisor.start(
    'caddy',
    'caddy',
    ['run', '--config', '/opt/kometio/Caddyfile'],
    {
      user: 'caddy',
      childEnv: caddyEnvironment({
        env,
        dataDir: DATA,
        domain,
        ports: { api: API_PORT, site: SITE_PORT, editor: EDITOR_PORT },
      }),
    },
  );
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

/** The API, and the wait until it answers. It is also what prints the setup token. */
async function startApi(s) {
  let expectingToken = false;
  supervisor.start('api', 'node', ['main.js'], {
    user: 'kometio',
    cwd: '/opt/api',
    childEnv: apiEnvironment({
      env,
      secrets: s,
      nodeEnv: NODE_ENV,
      port: API_PORT,
      trustedProxyHops: PROXY.trustedProxyHops,
      editorUrl: EDITOR_URL,
      apiPublicUrl: API_PUBLIC_URL,
      dataDir: DATA,
      ownDatabase: OWN_DATABASE,
      controlSocket: CONTROL_SOCKET,
    }),
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
}

async function startSite(s) {
  supervisor.start('site', 'node', ['server.mjs'], {
    user: 'kometio-site',
    cwd: '/opt/site',
    childEnv: siteEnvironment({
      env,
      secrets: s,
      port: SITE_PORT,
      apiPort: API_PORT,
      editorUrl: EDITOR_URL,
      apiPublicUrl: API_PUBLIC_URL,
    }),
  });
  await waitFor(
    'the public site',
    () => answers(`http://127.0.0.1:${SITE_PORT}/api/health`),
    60,
  );
}

async function main() {
  log(
    `starting (${NODE_ENV}${OWN_DATABASE ? ', with its own database' : `, database at ${env.POSTGRES_HOST}`})`,
  );
  const advice = proxyAdvice({
    ...addresses,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  if (advice) log(advice);
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

  if (OWN_DATABASE) {
    const ready = startEmbeddedDatabase(s.postgresAppPassword);
    await ready();
  }
  const adminEnv = databaseAdministrator({
    env,
    ownDatabase: OWN_DATABASE,
    socketDir: SOCKET_DIR,
  });
  migrate(adminEnv);
  if (OWN_DATABASE) await startControl(s, adminEnv);

  await startApi(s);
  await startSite(s);

  configureEditor();
  supervisor.start('editor', 'nginx', ['-c', '/opt/kometio/nginx.conf']);
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

if (process.argv[2] !== undefined) {
  // `docker run … export` or `import` (docs/adr/0105): a command, not a server.
  // It is the same Postgres, started for as long as the command takes.
  const { run } = await import('./cli.mjs');
  await run(process.argv[2]);
} else {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => void supervisor.shutdown(0));
  }

  main().catch((error) => {
    console.error(`[kometio] ${error.message}`);
    void supervisor.shutdown(1);
  });
}
