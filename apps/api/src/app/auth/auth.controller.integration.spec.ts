import request from 'supertest';
import { FakeCaptchaPort } from '@kometio/testing';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { AuthModule } from './auth.module';
import { CAPTCHA_PORT } from '../adapters/port.tokens';

/**
 * What the auth routes answer over HTTP when they refuse — the part a
 * caller probing for accounts actually sees. The rules live in
 * AuthErrorsFilter; this is where they are checked end to end.
 */
describe('AuthController (integration)', () => {
  let integration: IntegrationApp;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [AuthModule],
      overrideProviders: (builder) =>
        builder.overrideProvider(CAPTCHA_PORT).useClass(FakeCaptchaPort),
    });
  });

  afterAll(async () => {
    await integration.close();
  });

  const login = (email: string, password: string, captchaToken = 'token') =>
    request(integration.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password, captchaToken });

  it('answers a deactivated account exactly as a wrong password', async () => {
    const active = await integration.createUser();
    const deactivated = await integration.createUser({ isActive: false });

    const wrongPassword = await login(active.email, 'not-the-password').expect(
      401,
    );
    const switchedOff = await login(
      deactivated.email,
      deactivated.password,
    ).expect(401);

    expect(switchedOff.body.message).toBe(wrongPassword.body.message);
    expect(switchedOff.body.message).toBe('Invalid email or password');
  });

  it('refuses a missing captcha with a 400, not a server error', async () => {
    const user = await integration.createUser();

    await login(user.email, user.password, '').expect(400);
  });

  it('answers an unusable email token with a 400', async () => {
    await request(integration.app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'not-a-real-token' })
      .expect(400);
  });
});
