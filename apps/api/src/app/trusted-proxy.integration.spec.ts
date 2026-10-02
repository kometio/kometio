import request from 'supertest';
import { AuthModule } from './auth/auth.module';
import { IntegrationApp } from '../test/integration-app.test-fixture';

/**
 * Behind a proxy every visitor arrives from the proxy's own address. With
 * the hop trusted, each keeps their own: the login limit — five a minute
 * per address — is one visitor's, not the whole installation's.
 */
describe('Trusted proxy (integration)', () => {
  async function failedLogins(
    integration: IntegrationApp,
    forwardedFor: string,
    times: number,
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < times; attempt += 1) {
      const res = await request(integration.app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({
          // A different account each time: the per-account limit is not
          // what is being measured.
          email: `nobody-${forwardedFor}-${attempt}@example.test`,
          password: 'not-the-password',
          captchaToken: 'test-token',
        });
      statuses.push(res.status);
    }
    return statuses;
  }

  it('keeps one visitor from locking the others out of logging in', async () => {
    const integration = await IntegrationApp.start({
      imports: [AuthModule],
      trustedProxyHops: 1,
    });
    try {
      const noisy = await failedLogins(integration, '203.0.113.7', 6);
      expect(noisy.slice(0, 5).every((status) => status === 401)).toBe(true);
      expect(noisy[5]).toBe(429);

      // Another visitor, through the same proxy: still allowed to try.
      expect(await failedLogins(integration, '198.51.100.23', 1)).toEqual([
        401,
      ]);
    } finally {
      await integration.close();
    }
  });

  it('without the hop trusted, everyone behind the proxy shares one limit', async () => {
    const integration = await IntegrationApp.start({ imports: [AuthModule] });
    try {
      await failedLogins(integration, '203.0.113.7', 5);
      expect(await failedLogins(integration, '198.51.100.23', 1)).toEqual([
        429,
      ]);
    } finally {
      await integration.close();
    }
  });
});
