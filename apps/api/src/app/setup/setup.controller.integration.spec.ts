import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LauncherSiteArchiveAdapter } from '@kometio/launcher-site-archive';
import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { DEPLOYMENT_BOOTSTRAP_PORT } from '../adapters/port.tokens';
import { SITE_IMPORT } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { SetupModule } from './setup.module';
import { SetupTokenRegistry } from './setup-token.registry';

type Launcher = (request: IncomingMessage, response: ServerResponse) => void;

const GOOD_TOKEN = 'the-token-the-operator-read-in-the-log';

/**
 * The first-run import over real HTTP (docs/adr/0106): the browser's upload comes
 * in at the API, which hands it on, as it arrives, to the launcher's socket. The
 * launcher is a fake on a Unix socket; the deployment is made to look like one
 * nobody has set up, since the database this runs against has been.
 *
 * The route is limited to five a minute, so each group of tests has an app of its own.
 */
function useUnclaimedDeployment(hasBeenSetUp: boolean) {
  // Unix socket paths are short (104 bytes on a Mac): a folder in the system's temp.
  const directory = mkdtempSync(join(tmpdir(), 'ksi-'));
  const socketPath = join(directory, 'control.sock');
  const state: { launcher: Launcher; integration: IntegrationApp | undefined } =
    { launcher: () => undefined, integration: undefined };
  let server: Server;

  beforeAll(async () => {
    server = createServer((incoming, response) =>
      state.launcher(incoming, response),
    );
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    state.integration = await IntegrationApp.start({
      imports: [SetupModule, AuthModule],
      overrideProviders: (builder) =>
        builder
          .overrideProvider(DEPLOYMENT_BOOTSTRAP_PORT)
          .useValue({
            hasBeenSetUp: () => Promise.resolve(hasBeenSetUp),
            bootstrap: () => Promise.reject(new Error('not under test')),
          })
          // The token is the one the operator would read in the log.
          .overrideProvider(SetupTokenRegistry)
          .useValue({
            onApplicationBootstrap: () => undefined,
            verify: (candidate: string) => candidate === GOOD_TOKEN,
            clear: () => undefined,
          })
          .overrideProvider(SITE_IMPORT)
          .useValue(new LauncherSiteArchiveAdapter({ socketPath })),
    });
  });

  afterAll(async () => {
    await state.integration?.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    directory,
    launcherAnswers(launcher: Launcher) {
      state.launcher = launcher;
    },
    post(archive: Buffer, headers: Record<string, string> = {}) {
      if (!state.integration) throw new Error('the app is not started');
      return request(state.integration.app.getHttpServer())
        .post('/setup/import')
        .set('Content-Type', 'application/gzip')
        .set(headers)
        .send(archive);
    },
    status() {
      if (!state.integration) throw new Error('the app is not started');
      return request(state.integration.app.getHttpServer()).get(
        '/setup/status',
      );
    },
  };
}

const accepting: Launcher = (incoming, response) => {
  incoming.resume();
  incoming.on('end', () => {
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'accepted' }));
  });
};

/** Runs against a real Postgres — see docs/development.md. */
describe('SetupController, opening a site archive (integration)', () => {
  describe('on a deployment nobody has set up', () => {
    const app = useUnclaimedDeployment(false);

    it('passes the archive to the launcher byte for byte, and says it is accepted (202)', async () => {
      // Bigger than any buffer on the way, and not compressible.
      const archive = randomBytes(6 * 1024 * 1024);
      let arrived = '';
      let size = 0;
      app.launcherAnswers((incoming, response) => {
        const hash = createHash('sha256');
        incoming.on('data', (chunk: Buffer) => {
          hash.update(chunk);
          size += chunk.length;
        });
        incoming.on('end', () => {
          arrived = hash.digest('hex');
          response.writeHead(202, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'accepted' }));
        });
      });

      const response = await app
        .post(archive, { 'X-Setup-Token': GOOD_TOKEN })
        .expect(202);

      expect(response.body).toEqual({ accepted: true });
      expect(size).toBe(archive.length);
      expect(arrived).toBe(createHash('sha256').update(archive).digest('hex'));
    });

    it('asks for the setup token before reading any of it: none, or a wrong one, is a 401', async () => {
      let touched = false;
      app.launcherAnswers((incoming, response) => {
        touched = true;
        accepting(incoming, response);
      });

      await app.post(randomBytes(1024)).expect(401);
      await app
        .post(randomBytes(1024), { 'X-Setup-Token': 'a-guess' })
        .expect(401);

      expect(touched).toBe(false);
    });

    it('says what is wrong with the archive, as the launcher found it: 400', async () => {
      app.launcherAnswers((incoming, response) => {
        incoming.resume();
        incoming.on('end', () => {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ message: 'this is not a Kometio site archive' }),
          );
        });
      });

      const response = await app
        .post(Buffer.from('not an archive'), { 'X-Setup-Token': GOOD_TOKEN })
        .expect(400);

      expect(response.body.message).toBe('this is not a Kometio site archive');
    });

    it('says why when the launcher is busy: 409', async () => {
      app.launcherAnswers((incoming, response) => {
        response.writeHead(409, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ message: 'a site is being opened here' }),
        );
        incoming.resume();
      });

      const response = await app
        .post(Buffer.from('x'), { 'X-Setup-Token': GOOD_TOKEN })
        .expect(409);

      expect(response.body.message).toBe('a site is being opened here');
    });
  });

  describe('on a deployment that has a site', () => {
    const app = useUnclaimedDeployment(true);

    it('refuses it, with the token right, and the launcher is not asked: 409', async () => {
      let touched = false;
      app.launcherAnswers((incoming, response) => {
        touched = true;
        accepting(incoming, response);
      });

      await app
        .post(Buffer.from('x'), { 'X-Setup-Token': GOOD_TOKEN })
        .expect(409);

      expect(touched).toBe(false);
    });

    it('does not say why an old import failed: there is a site now', async () => {
      writeFileSync(
        join(app.directory, 'import-result.json'),
        JSON.stringify({ ok: false, message: 'old news' }),
      );

      const response = await app.status().expect(200);

      expect(response.body).toEqual({
        hasBeenSetUp: true,
        importFailure: null,
      });
    });
  });

  describe('the screen that waits for the import', () => {
    const app = useUnclaimedDeployment(false);

    it('is told why it failed, in the launcher’s words, once the API is back', async () => {
      writeFileSync(
        join(app.directory, 'import-result.json'),
        JSON.stringify({
          ok: false,
          message: 'there is not enough room on the volume',
        }),
      );

      const response = await app.status().expect(200);

      expect(response.body).toEqual({
        hasBeenSetUp: false,
        importFailure: 'there is not enough room on the volume',
      });
    });
  });
});
