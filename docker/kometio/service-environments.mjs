// What each part of the image is told, as plain functions of what the launcher
// knows: the environment it was started with, the secrets, the addresses.
//
// They read nothing from the machine and start nothing, so that what each part
// may see (and above all what it may not) is something a test can state.
import { minimalEnv } from './processes.mjs';

/**
 * The three secrets the stack shares. What the user set wins; what is missing
 * is generated once and kept in /data/state, so it is the same on every start.
 * Only generated values are kept: one the user supplied stays theirs.
 *
 * `stored` is what was kept (an object, possibly empty); `generate` makes one
 * new secret. Returns the values to use and what is to be kept now.
 */
export function resolveSecrets({ env, stored, generate }) {
  const kept = { ...stored };
  const fromEnv = {
    postgresAppPassword: env.POSTGRES_APP_PASSWORD,
    previewTokenSecret: env.PREVIEW_TOKEN_SECRET,
    publicApiServiceToken: env.PUBLIC_API_SERVICE_TOKEN,
  };
  const values = {};
  for (const [key, supplied] of Object.entries(fromEnv)) {
    values[key] = supplied ?? (kept[key] ??= generate());
  }
  return { values, kept };
}

/**
 * The API. The user's own variables win over the defaults, so a deployment
 * can set SMTP, S3, its own Turnstile keys, NODE_ENV=production, and so on.
 * The database administrator's credentials stay out of its reach, and the
 * values that are the launcher's to decide are, whatever the environment says.
 */
export function apiEnvironment({
  env,
  secrets,
  nodeEnv,
  port,
  trustedProxyHops,
  editorUrl,
  apiPublicUrl,
  dataDir,
  ownDatabase,
  controlSocket,
}) {
  const { POSTGRES_USER, POSTGRES_PASSWORD, ...userEnv } = env;
  void POSTGRES_USER;
  void POSTGRES_PASSWORD;
  return {
    NODE_ENV: nodeEnv,
    PORT: String(port),
    // Caddy is one hop in front of the API on a server, and every limit per
    // visitor (five logins a minute, the forms) keys on who the visitor is: with
    // none, every visitor would be Caddy, and one could lock everybody out.
    ...(trustedProxyHops ? { TRUSTED_PROXY_HOPS: trustedProxyHops } : {}),
    PREVIEW_TOKEN_SECRET: secrets.previewTokenSecret,
    PUBLIC_API_SERVICE_TOKEN: secrets.publicApiServiceToken,
    EDITOR_APP_URL: editorUrl,
    API_PUBLIC_URL: apiPublicUrl,
    // No SMTP_* here: without a mail server the API writes each email (an
    // invitation, a password reset) to its log, link included. Set SMTP_* to
    // a real server to send them (docs/adr/0103).
    MEDIA_UPLOAD_DIR: `${dataDir}/uploads`,
    THEMES_DIR: '/opt/api/themes',
    KOMETIO_SECRETS_DIR: `${dataDir}/secrets`,
    // No TURNSTILE_* either: with neither key the captcha is the one built into
    // Kometio, which needs no account and no network. Both of a site's own keys
    // switch to Cloudflare's (docs/adr/0103), through `userEnv` below.
    ...userEnv,
    HOME: '/tmp',
    // These are this launcher's to decide, whatever the environment says.
    POSTGRES_APP_PASSWORD: secrets.postgresAppPassword,
    ...(ownDatabase ? { POSTGRES_HOST: '127.0.0.1' } : {}),
    // The editor offers an export only where there is somebody to make it.
    KOMETIO_CONTROL_SOCKET: ownDatabase ? controlSocket : undefined,
  };
}

/**
 * The public site. Not the whole environment: this server runs the code of a
 * theme, so it gets exactly what it reads, as in the compose stack. An empty
 * value is "not set" to each optional one.
 */
export function siteEnvironment({
  env,
  secrets,
  port,
  apiPort,
  editorUrl,
  apiPublicUrl,
}) {
  return {
    ...minimalEnv,
    PORT: String(port),
    API_URL: `http://127.0.0.1:${apiPort}/api`,
    EDITOR_APP_URL: editorUrl,
    API_PUBLIC_URL: apiPublicUrl,
    PUBLIC_API_SERVICE_TOKEN: secrets.publicApiServiceToken,
    TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY ?? '',
    KOMETIO_THEME: env.KOMETIO_THEME ?? '',
    S3_MEDIA_PUBLIC_BASE_URL: env.S3_MEDIA_PUBLIC_BASE_URL ?? '',
  };
}

/**
 * The proxy of a server: where Kometio keeps its certificates and its account
 * (the volume, so that a restart does not ask the certificate authority again:
 * it limits how often it will issue for a name), and where the three halves
 * are. Its admin API is off, which a theme's code, running in this container,
 * must not reach.
 */
export function caddyEnvironment({ env, dataDir, domain, ports }) {
  return {
    PATH: env.PATH,
    HOME: '/tmp',
    XDG_DATA_HOME: `${dataDir}/caddy`,
    XDG_CONFIG_HOME: '/tmp/caddy',
    DOMAIN: domain,
    SITE_UPSTREAM: `127.0.0.1:${ports.site}`,
    EDITOR_UPSTREAM: `127.0.0.1:${ports.editor}`,
    API_UPSTREAM: `127.0.0.1:${ports.api}`,
    KOMETIO_CADDY_OPTIONS: 'admin off\nskip_install_trust',
    KOMETIO_ACME_EMAIL_LINE: env.ACME_EMAIL ? `email ${env.ACME_EMAIL}` : '',
  };
}

/**
 * What the migrator and the control server connect to the database with: the
 * administrator's role. The embedded database is reached through its socket
 * (docs/adr/0107); a database elsewhere over the network, with the credentials
 * the deployment gave.
 */
export function databaseAdministrator({ env, ownDatabase, socketDir }) {
  if (ownDatabase) {
    return {
      POSTGRES_HOST: socketDir,
      POSTGRES_PORT: '5432',
      POSTGRES_USER: 'kometio',
      POSTGRES_DB: 'kometio',
    };
  }
  return {
    POSTGRES_HOST: env.POSTGRES_HOST,
    POSTGRES_PORT: env.POSTGRES_PORT ?? '5432',
    POSTGRES_USER: env.POSTGRES_USER,
    POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
    POSTGRES_DB: env.POSTGRES_DB ?? 'kometio',
  };
}

/**
 * The editor's nginx configuration, from the editor image's own template.
 * `values` fills each `${KOMETIO_…}`; one the template wants and `values` does
 * not have is an error, not an empty string.
 *
 * The template is the editor image's own and listens on 80, which is right for
 * a trial. On a server the editor listens on a loopback port instead, for
 * Caddy; the line is changed here rather than the template forked, and a
 * template that no longer has it is an error, not a silent 80.
 */
export function renderEditorConfig({ template, values, editorPort }) {
  const rendered = template.replace(/\$\{(KOMETIO_[A-Z_]+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`the editor template needs ${name}`);
    return values[name];
  });
  if (editorPort === 80) return rendered;
  const listening = rendered.replace(
    /^(\s*)listen 80;/m,
    `$1listen 127.0.0.1:${editorPort};`,
  );
  if (listening === rendered) {
    throw new Error(
      "the editor's template no longer has a `listen 80;` to move",
    );
  }
  return listening;
}
