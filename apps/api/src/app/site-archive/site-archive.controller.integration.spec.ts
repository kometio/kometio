import { mkdtempSync, rmSync } from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LauncherSiteArchiveAdapter } from '@kometio/launcher-site-archive';
import request from 'supertest';
import {
  IntegrationApp,
  type IntegrationUser,
} from '../../test/integration-app.test-fixture';
import { SITE_ARCHIVE } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { SiteArchiveModule } from './site-archive.module';

type Launcher = (request: IncomingMessage, response: ServerResponse) => void;

/**
 * An API wired to a fake launcher: a server on a Unix socket, which each test
 * makes answer as it needs, and one signed-in administrator. The route is
 * limited to ten a minute, so each group of tests has an app of its own.
 */
function useLauncherApp() {
  // Unix socket paths are short (104 bytes on a Mac): a folder in the system's temp.
  const directory = mkdtempSync(join(tmpdir(), 'ksa-'));
  const socketPath = join(directory, 'control.sock');
  const state: {
    launcher: Launcher;
    integration: IntegrationApp | undefined;
    asAdmin: string;
  } = { launcher: () => undefined, integration: undefined, asAdmin: '' };
  let server: Server;

  beforeAll(async () => {
    // The launcher of the single image, as far as the API can tell.
    server = createServer((incoming, response) =>
      state.launcher(incoming, response),
    );
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    state.integration = await IntegrationApp.start({
      imports: [SiteArchiveModule, AuthModule],
      overrideProviders: (builder) =>
        builder
          .overrideProvider(SITE_ARCHIVE)
          .useValue(new LauncherSiteArchiveAdapter({ socketPath })),
    });
    // One sign-in, as a `Cookie` header: the login is limited per account, and
    // every test here is the same administrator.
    state.asAdmin = await sessionCookieOf(
      state.integration,
      await state.integration.createUser({ role: 'admin' }),
    );
  });

  afterAll(async () => {
    await state.integration?.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    launcherAnswers(launcher: Launcher) {
      state.launcher = launcher;
    },
    get integration(): IntegrationApp {
      if (!state.integration) throw new Error('the app is not started');
      return state.integration;
    },
    get(path: string) {
      return request(this.integration.app.getHttpServer())
        .get(path)
        .set('Cookie', state.asAdmin);
    },
    get adminCookie() {
      return state.asAdmin;
    },
  };
}

const archive: Launcher = (_incoming, response) => {
  response.writeHead(200, {
    'content-type': 'application/gzip',
    'content-disposition':
      'attachment; filename="kometio-site-20261005-1200.tar.gz"',
  });
  response.end('the archive');
};

/** Runs against a real Postgres — see docs/development.md. */
describe('SiteArchiveController (integration)', () => {
  const app = useLauncherApp();

  it('gives an administrator the archive as a download, as the launcher makes it', async () => {
    app.launcherAnswers(archive);

    const response = await app
      .get('/site-archive')
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks).toString()));
      })
      .expect(200);

    expect(response.body).toBe('the archive');
    expect(response.headers['content-type']).toBe('application/gzip');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="kometio-site-20261005-1200.tar.gz"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    // Already a gzip: the server's own compression would only spend time on it.
    expect(response.headers['content-encoding']).toBeUndefined();
  });

  it('is for an administrator: nobody signed in, an editor or a publisher is refused', async () => {
    app.launcherAnswers(archive);
    const server = app.integration.app.getHttpServer();

    await request(server).get('/site-archive').expect(401);
    for (const role of ['editor', 'publisher'] as const) {
      const cookie = await sessionCookieOf(
        app.integration,
        await app.integration.createUser({ role }),
      );
      await request(server)
        .get('/site-archive')
        .set('Cookie', cookie)
        .expect(403);
    }
  });

  it('refuses a link followed from another site, and takes one from the editor’s own', async () => {
    app.launcherAnswers(archive);

    await app
      .get('/site-archive')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
    await app
      .get('/site-archive')
      .set('Sec-Fetch-Site', 'same-site')
      .expect(200);
  });
});

describe('SiteArchiveController when the launcher cannot make the archive (integration)', () => {
  const app = useLauncherApp();

  it('says what the launcher said when it is not able now: 409, with its words', async () => {
    app.launcherAnswers((_incoming, response) => {
      response.writeHead(409, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          message: 'an export is already being made: wait for it',
        }),
      );
    });

    const response = await app.get('/site-archive').expect(409);

    expect(response.body.message).toBe(
      'an export is already being made: wait for it',
    );
  });

  it('answers 500, and not what the launcher said, when the launcher fails', async () => {
    app.launcherAnswers((_incoming, response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'pg_dump failed: /secret/path' }));
    });

    const response = await app.get('/site-archive').expect(500);

    expect(JSON.stringify(response.body)).not.toContain('/secret/path');
  });

  it('cuts the connection, rather than ending it as if it were whole, when the archive fails on its way', async () => {
    app.launcherAnswers((_incoming, response) => {
      response.writeHead(200, {
        'content-disposition': 'attachment; filename="a.tar.gz"',
      });
      response.write('half of it');
      setTimeout(() => response.destroy(), 20);
    });
    const address = app.integration.app.getHttpServer().address();
    if (typeof address === 'string' || address === null) {
      throw new Error('the app is not listening on a port');
    }

    const outcome = await new Promise<string>((resolve) => {
      const outgoing = httpRequest(
        {
          host: '127.0.0.1',
          port: address.port,
          path: '/site-archive',
          headers: { cookie: app.adminCookie },
        },
        (response) => {
          // 200: the archive had begun, which is the case that matters.
          if (response.statusCode !== 200) {
            resolve(`answered ${response.statusCode}`);
            return;
          }
          response.on('data', () => undefined);
          response.on('end', () => resolve('ended whole'));
          response.on('error', () => resolve('cut'));
          response.on('aborted', () => resolve('cut'));
        },
      );
      outgoing.on('error', () => resolve('cut'));
      outgoing.end();
    });

    expect(outcome).toBe('cut');
  });
});

describe('SiteArchiveController on a deployment that cannot make one (integration)', () => {
  let integration: IntegrationApp;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [SiteArchiveModule, AuthModule],
      overrideProviders: (builder) =>
        builder.overrideProvider(SITE_ARCHIVE).useValue(null),
    });
  });

  afterAll(async () => {
    await integration.close();
  });

  it('answers 404, as for a route that is not there', async () => {
    const cookie = await sessionCookieOf(
      integration,
      await integration.createUser({ role: 'admin' }),
    );

    await request(integration.app.getHttpServer())
      .get('/site-archive')
      .set('Cookie', cookie)
      .expect(404);
  });
});

/** The session cookie a login gives, as a `Cookie` header, for a client that is not supertest. */
async function sessionCookieOf(
  integration: IntegrationApp,
  user: IntegrationUser,
): Promise<string> {
  const response = await request(integration.app.getHttpServer())
    .post('/auth/login')
    .send({
      email: user.email,
      password: user.password,
      captchaToken: 'test-token',
    })
    .expect(200);
  const set = response.headers['set-cookie'];
  const cookies: string[] = Array.isArray(set) ? set : [];
  return cookies.map((line) => line.split(';')[0]).join('; ');
}
