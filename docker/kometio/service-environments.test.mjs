import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apiEnvironment,
  caddyEnvironment,
  databaseAdministrator,
  renderEditorConfig,
  resolveSecrets,
  siteEnvironment,
} from './service-environments.mjs';

const secrets = {
  postgresAppPassword: 'app-password',
  previewTokenSecret: 'preview-secret',
  publicApiServiceToken: 'service-token',
};

const apiInput = (overrides = {}) => ({
  env: {},
  secrets,
  nodeEnv: 'development',
  port: 3000,
  trustedProxyHops: undefined,
  editorUrl: 'http://localhost:4200',
  apiPublicUrl: 'http://localhost:3000/api',
  dataDir: '/data',
  ownDatabase: true,
  controlSocket: '/run/kometio/control.sock',
  ...overrides,
});

describe('the secrets', () => {
  const sequence = () => {
    let n = 0;
    return () => `generated-${(n += 1)}`;
  };

  it('makes the ones the user did not set, and keeps only those', () => {
    const { values, kept } = resolveSecrets({
      env: { PREVIEW_TOKEN_SECRET: 'mine' },
      stored: {},
      generate: sequence(),
    });

    assert.equal(values.previewTokenSecret, 'mine');
    assert.equal(values.postgresAppPassword, 'generated-1');
    assert.equal(values.publicApiServiceToken, 'generated-2');
    assert.deepEqual(kept, {
      postgresAppPassword: 'generated-1',
      publicApiServiceToken: 'generated-2',
    });
  });

  it('is the same on the next start: what was kept is used, and nothing is made again', () => {
    const first = resolveSecrets({
      env: {},
      stored: {},
      generate: sequence(),
    });

    const second = resolveSecrets({
      env: {},
      stored: first.kept,
      generate: () => assert.fail('made a secret that was already kept'),
    });

    assert.deepEqual(second.values, first.values);
  });

  it('lets the user take one over later, without forgetting the one it had', () => {
    const { values, kept } = resolveSecrets({
      env: { POSTGRES_APP_PASSWORD: 'now-mine' },
      stored: { postgresAppPassword: 'generated-before' },
      generate: sequence(),
    });

    assert.equal(values.postgresAppPassword, 'now-mine');
    assert.equal(kept.postgresAppPassword, 'generated-before');
  });
});

describe('what the API is told', () => {
  it('does not get the database administrator’s credentials, whatever the deployment set', () => {
    const environment = apiEnvironment(
      apiInput({
        env: {
          POSTGRES_USER: 'admin',
          POSTGRES_PASSWORD: 'admin-password',
          SMTP_HOST: 'mail.example.test',
        },
      }),
    );

    assert.equal('POSTGRES_USER' in environment, false);
    assert.equal('POSTGRES_PASSWORD' in environment, false);
    assert.equal(environment.SMTP_HOST, 'mail.example.test');
  });

  it('takes what the deployment set over the defaults', () => {
    const environment = apiEnvironment(
      apiInput({ env: { THEMES_DIR: '/my/themes', MEDIA_UPLOAD_DIR: '/m' } }),
    );

    assert.equal(environment.THEMES_DIR, '/my/themes');
    assert.equal(environment.MEDIA_UPLOAD_DIR, '/m');
  });

  it('decides the application role’s password itself, and its home', () => {
    const environment = apiEnvironment(
      apiInput({
        env: { POSTGRES_APP_PASSWORD: 'other', HOME: '/root' },
      }),
    );

    assert.equal(environment.POSTGRES_APP_PASSWORD, 'app-password');
    assert.equal(environment.HOME, '/tmp');
  });

  it('is told the hop of the proxy only when there is one', () => {
    assert.equal('TRUSTED_PROXY_HOPS' in apiEnvironment(apiInput()), false);
    assert.equal(
      apiEnvironment(apiInput({ trustedProxyHops: '1' })).TRUSTED_PROXY_HOPS,
      '1',
    );
  });

  it('reaches its own database over the loopback and offers the export, when the database is its own', () => {
    const own = apiEnvironment(apiInput({ ownDatabase: true }));

    assert.equal(own.POSTGRES_HOST, '127.0.0.1');
    assert.equal(own.KOMETIO_CONTROL_SOCKET, '/run/kometio/control.sock');
  });

  it('keeps the database the deployment named, and offers no export, when it is elsewhere', () => {
    const elsewhere = apiEnvironment(
      apiInput({
        ownDatabase: false,
        env: { POSTGRES_HOST: 'db.example.test' },
      }),
    );

    assert.equal(elsewhere.POSTGRES_HOST, 'db.example.test');
    assert.equal(elsewhere.KOMETIO_CONTROL_SOCKET, undefined);
  });
});

describe('what the public site is told', () => {
  it('is exactly what it reads: no database, no secrets but its own token', () => {
    const environment = siteEnvironment({
      env: {
        POSTGRES_PASSWORD: 'admin-password',
        POSTGRES_APP_PASSWORD: 'app-password',
        PREVIEW_TOKEN_SECRET: 'preview-secret',
        TURNSTILE_SITE_KEY: 'site-key',
        SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/1',
        SENTRY_ENVIRONMENT: 'trial',
        SENTRY_RELEASE: 'v0.1.0',
      },
      secrets,
      port: 4322,
      apiPort: 3000,
      editorUrl: 'http://localhost:4200',
      apiPublicUrl: 'http://localhost:3000/api',
    });

    assert.deepEqual(Object.keys(environment).sort(), [
      'API_PUBLIC_URL',
      'API_URL',
      'EDITOR_APP_URL',
      'HOME',
      'IMAGE_CACHE_MAX_MB',
      'KOMETIO_THEME',
      'LANG',
      'PATH',
      'PORT',
      'PUBLIC_API_SERVICE_TOKEN',
      'S3_MEDIA_PUBLIC_BASE_URL',
      'SENTRY_DSN',
      'SENTRY_ENVIRONMENT',
      'SENTRY_RELEASE',
      'TURNSTILE_SITE_KEY',
    ]);
    assert.equal(environment.API_URL, 'http://127.0.0.1:3000/api');
    assert.equal(environment.PUBLIC_API_SERVICE_TOKEN, 'service-token');
    assert.equal(environment.TURNSTILE_SITE_KEY, 'site-key');
    // Where it reports its errors: the same three the API reads (docs/adr/0114).
    assert.equal(
      environment.SENTRY_DSN,
      'https://key@o1.ingest.de.sentry.io/1',
    );
    assert.equal(environment.SENTRY_ENVIRONMENT, 'trial');
    assert.equal(environment.SENTRY_RELEASE, 'v0.1.0');
  });

  it('has an empty value, not an undefined one, for each optional setting it was not given', () => {
    const environment = siteEnvironment({
      env: {},
      secrets,
      port: 4322,
      apiPort: 3000,
      editorUrl: 'e',
      apiPublicUrl: 'a',
    });

    assert.equal(environment.TURNSTILE_SITE_KEY, '');
    assert.equal(environment.SENTRY_DSN, '');
    assert.equal(environment.KOMETIO_THEME, '');
    assert.equal(environment.S3_MEDIA_PUBLIC_BASE_URL, '');
    assert.equal(environment.IMAGE_CACHE_MAX_MB, '');
  });
});

describe('what the proxy of a server is told', () => {
  const input = {
    env: { PATH: '/usr/bin', ACME_EMAIL: 'owner@example.test' },
    dataDir: '/data',
    domain: 'example.com',
    ports: { api: 3000, site: 4322, editor: 8080 },
  };

  it('keeps its certificates in the volume and has its admin API off', () => {
    const environment = caddyEnvironment(input);

    assert.equal(environment.XDG_DATA_HOME, '/data/caddy');
    assert.match(environment.KOMETIO_CADDY_OPTIONS, /^admin off\n/);
  });

  it('is told where each half is', () => {
    const environment = caddyEnvironment(input);

    assert.equal(environment.DOMAIN, 'example.com');
    assert.equal(environment.SITE_UPSTREAM, '127.0.0.1:4322');
    assert.equal(environment.EDITOR_UPSTREAM, '127.0.0.1:8080');
    assert.equal(environment.API_UPSTREAM, '127.0.0.1:3000');
  });

  it('is given the owner’s email for the certificates only when there is one', () => {
    assert.equal(
      caddyEnvironment(input).KOMETIO_ACME_EMAIL_LINE,
      'email owner@example.test',
    );
    assert.equal(
      caddyEnvironment({ ...input, env: { PATH: '/usr/bin' } })
        .KOMETIO_ACME_EMAIL_LINE,
      '',
    );
  });
});

describe('how the migrator reaches the database', () => {
  it('is through the socket, as the administrator role, for the embedded database', () => {
    assert.deepEqual(
      databaseAdministrator({
        env: { POSTGRES_PASSWORD: 'ignored' },
        ownDatabase: true,
        socketDir: '/run/postgresql',
      }),
      {
        POSTGRES_HOST: '/run/postgresql',
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'kometio',
        POSTGRES_DB: 'kometio',
      },
    );
  });

  it('is with the credentials the deployment gave, for a database elsewhere', () => {
    assert.deepEqual(
      databaseAdministrator({
        env: {
          POSTGRES_HOST: 'db.example.test',
          POSTGRES_USER: 'admin',
          POSTGRES_PASSWORD: 'secret',
        },
        ownDatabase: false,
        socketDir: '/run/postgresql',
      }),
      {
        POSTGRES_HOST: 'db.example.test',
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'admin',
        POSTGRES_PASSWORD: 'secret',
        POSTGRES_DB: 'kometio',
      },
    );
  });
});

describe("the editor's configuration", () => {
  const template =
    'server {\n  listen 80;\n  location /config.js { return 200 "${KOMETIO_API_URL}"; }\n}\n';

  it('has its values filled in', () => {
    const rendered = renderEditorConfig({
      template,
      values: { KOMETIO_API_URL: 'http://localhost:3000/api' },
      editorPort: 80,
    });

    assert.match(rendered, /return 200 "http:\/\/localhost:3000\/api"/);
    assert.match(rendered, /listen 80;/);
  });

  it('listens on a loopback port instead of 80 where Caddy has 80', () => {
    const rendered = renderEditorConfig({
      template,
      values: { KOMETIO_API_URL: 'x' },
      editorPort: 8080,
    });

    assert.match(rendered, /^\s*listen 127\.0\.0\.1:8080;/m);
    assert.doesNotMatch(rendered, /listen 80;/);
  });

  it('is an error when the template wants a value it was not given', () => {
    assert.throws(
      () => renderEditorConfig({ template, values: {}, editorPort: 80 }),
      /the editor template needs KOMETIO_API_URL/,
    );
  });

  it('is an error, not a silent 80, when the template no longer has the line to move', () => {
    assert.throws(
      () =>
        renderEditorConfig({
          template: 'server { listen 8000; }',
          values: {},
          editorPort: 8080,
        }),
      /no longer has a `listen 80;`/,
    );
  });
});
