import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import {
  IntegrationApp,
  type IntegrationUser,
} from '../../test/integration-app.test-fixture';
import { ActivityModule } from './activity.module';

/** Runs against a real Postgres — see docs/development.md. */
describe('ActivityController (integration)', () => {
  let integration: IntegrationApp;
  let admin: IntegrationUser;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    // One proxy in front, so that the failed sign-ins below come from
    // addresses of their own: the login limit is per address (five a minute).
    integration = await IntegrationApp.start({
      imports: [ActivityModule, AuthModule],
      trustedProxyHops: 1,
    });
    admin = await integration.createUser({ role: 'admin' });
    agent = await integration.login(admin);
  });

  afterAll(async () => {
    await integration.close();
  });

  it('refuses anyone without a session', async () => {
    await request(integration.app.getHttpServer()).get('/activity').expect(401);
  });

  it('is the administrator’s: another role is refused', async () => {
    const editor = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );
    const publisher = await integration.login(
      await integration.createUser({ role: 'publisher' }),
    );

    await editor.get('/activity').expect(403);
    await publisher.get('/activity').expect(403);
  });

  it('shows the administrator who signed in, as the account is described now, and nothing about where from', async () => {
    const res = await agent.get('/activity').expect(200);

    const entry = res.body.items.find(
      (item: { actor: { id: string } | null; action: string }) =>
        item.actor?.id === admin.id && item.action === 'login.succeeded',
    );
    expect(entry).toMatchObject({
      action: 'login.succeeded',
      actor: { id: admin.id, email: admin.email },
    });
    expect(Object.keys(entry).sort()).toEqual([
      'action',
      'actor',
      'at',
      'detail',
      'id',
      'targetId',
      'targetLabel',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(
      /127\.0\.0\.1|::1|user-agent/i,
    );
  });

  it('says a wrong password was tried on an account, and nothing for an address nobody has', async () => {
    const server = integration.app.getHttpServer();
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', '10.9.9.9')
      .send({
        email: admin.email,
        password: 'not-the-password',
        captchaToken: 'test-token',
      });
    await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', '10.9.9.10')
      .send({
        email: 'nobody-has-this@example.test',
        password: 'whatever',
        captchaToken: 'test-token',
      });

    const res = await agent
      .get('/activity')
      .query({ pageSize: 100 })
      .expect(200);

    const failed = res.body.items.filter(
      (item: { action: string }) => item.action === 'login.failed',
    );
    expect(
      failed.some(
        (item: { actor: { id: string } | null; detail: unknown }) =>
          item.actor?.id === admin.id &&
          JSON.stringify(item.detail) === '{"reason":"wrong-password"}',
      ),
    ).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('nobody-has-this');
  });

  it('pages, and refuses a page size it will not make', async () => {
    const first = await agent
      .get('/activity')
      .query({ page: 1, pageSize: 1 })
      .expect(200);

    expect(first.body.items).toHaveLength(1);
    expect(first.body.total).toBeGreaterThanOrEqual(1);
    await agent.get('/activity').query({ pageSize: 1000 }).expect(400);
  });
});
