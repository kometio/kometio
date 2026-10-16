import { AltchaCaptchaAdapter } from '@kometio/altcha-captcha';
import {
  asAltchaChallenge,
  solvedToken,
} from '@kometio/altcha-captcha/testing';
import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { CAPTCHA_CHALLENGE_PORT, CAPTCHA_PORT } from '../adapters/port.tokens';
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

  describe('a sign-in answered with the challenge it was given', () => {
    let integration: IntegrationApp;

    beforeAll(async () => {
      // The real captcha, not the fake the fixture puts in: one adapter makes
      // the challenge and checks the solution, as `createCaptcha` hands it out.
      const captcha = new AltchaCaptchaAdapter({ secret: 'a-secret', cost: 1 });
      integration = await IntegrationApp.start({
        imports: [CaptchaModule, AuthModule],
        overrideProviders: (builder) =>
          builder
            .overrideProvider(CAPTCHA_PORT)
            .useValue(captcha)
            .overrideProvider(CAPTCHA_CHALLENGE_PORT)
            .useValue(captcha),
      });
    });

    afterAll(async () => {
      await integration.close();
    });

    it('signs in with a solved challenge, once: the same solution is spent, and no solution is refused', async () => {
      const user = await integration.createUser();
      const server = integration.app.getHttpServer();
      const challenge = await request(server).get('/captcha/challenge');
      const captchaToken = await solvedToken(asAltchaChallenge(challenge.body));
      const signIn = (token: string) =>
        request(server).post('/auth/login').send({
          email: user.email,
          password: user.password,
          captchaToken: token,
        });

      await signIn(captchaToken).expect(200);
      await signIn(captchaToken).expect(400);
      await signIn('').expect(400);
    });
  });
});
