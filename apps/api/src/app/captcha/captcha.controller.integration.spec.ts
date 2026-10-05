import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { CAPTCHA_CHALLENGE_PORT } from '../adapters/port.tokens';
import { AuthModule } from '../auth/auth.module';
import { CaptchaModule } from './captcha.module';

/** Runs against a real Postgres — see docs/development.md. */
describe('CaptchaController (integration)', () => {
  describe('on a deployment with the captcha built into Kometio', () => {
    let integration: IntegrationApp;

    beforeAll(async () => {
      integration = await IntegrationApp.start({
        // AuthModule only brings the database the fixture reads its tenant from.
        imports: [CaptchaModule, AuthModule],
        overrideProviders: (builder) =>
          builder
            .overrideProvider(CAPTCHA_CHALLENGE_PORT)
            .useValue(
              new AltchaCaptchaAdapter({ secret: 'a-secret', cost: 1 }),
            ),
      });
    });

    afterAll(async () => {
      await integration.close();
    });

    it('hands anyone a signed challenge, never from a cache, and a different one each time', async () => {
      const server = integration.app.getHttpServer();

      const first = await request(server).get('/captcha/challenge').expect(200);
      const second = await request(server)
        .get('/captcha/challenge')
        .expect(200);

      expect(first.headers['cache-control']).toBe('no-store');
      expect(first.body.signature).toEqual(expect.any(String));
      expect(first.body.parameters.algorithm).toBe('PBKDF2/SHA-256');
      expect(first.body.parameters.nonce).not.toBe(
        second.body.parameters.nonce,
      );
    });
  });

  describe('on a deployment with Cloudflare Turnstile', () => {
    let integration: IntegrationApp;

    beforeAll(async () => {
      integration = await IntegrationApp.start({
        imports: [CaptchaModule, AuthModule],
        overrideProviders: (builder) =>
          builder.overrideProvider(CAPTCHA_CHALLENGE_PORT).useValue(null),
      });
    });

    afterAll(async () => {
      await integration.close();
    });

    it('has no challenge to give: 404', async () => {
      await request(integration.app.getHttpServer())
        .get('/captcha/challenge')
        .expect(404);
    });
  });
});
