import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiEnvModule } from './api-env.module';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { DemoModeGuard } from './demo-mode.guard';
import { FormsModule } from './forms/forms.module';
import { MediaModule } from './media/media.module';
import { SitesModule } from './sites/sites.module';
import { IntegrationApp } from '../test/integration-app.test-fixture';

/** What main.ts's AppModule does, for the modules under test. */
@Module({
  imports: [ApiEnvModule],
  providers: [{ provide: APP_GUARD, useClass: DemoModeGuard }],
})
class DemoGuardModule {}

/**
 * A deployment that is a demo, over real HTTP (docs/adr/0118): the account
 * everybody signs in with is an admin on paper and a publisher in fact.
 */
describe('A demo deployment (integration)', () => {
  let integration: IntegrationApp;
  let admin: ReturnType<typeof request.agent>;
  let previous: string | undefined;
  const id = randomUUID();

  beforeAll(async () => {
    previous = process.env['KOMETIO_DEMO'];
    process.env['KOMETIO_DEMO'] = 'true';
    integration = await IntegrationApp.start({
      imports: [
        DemoGuardModule,
        AuthModule,
        AccountModule,
        FormsModule,
        MediaModule,
        SitesModule,
      ],
    });
    admin = await integration.login(
      await integration.createUser({ role: 'admin' }),
    );
  });

  afterAll(async () => {
    await integration.close();
    if (previous === undefined) delete process.env['KOMETIO_DEMO'];
    else process.env['KOMETIO_DEMO'] = previous;
  });

  it('tells the editor the account is a publisher, which is what the guards will say', async () => {
    const response = await admin.get('/auth/session').expect(200);

    expect(response.body.role).toBe('publisher');
  });

  it('refuses a route only an admin may call, to the admin', async () => {
    const response = await admin
      .patch(`/sites/${id}/general-settings`)
      .send({})
      .expect(403);

    expect(response.body.message).toBe('Not available in the demo');
  });

  it('refuses an upload, and a change of the account', async () => {
    await admin.post('/media').expect(403);
    await admin
      .post('/account/password')
      .send({ currentPassword: 'x', newPassword: 'y' })
      .expect(403);
  });

  // Express matches an address without regard to case and with or without a
  // final slash. The guard reads the route that matched, not the address, so
  // every spelling that reaches the handler is the same refusal.
  it('refuses an upload by whatever spelling reaches the handler', async () => {
    await admin.post('/MEDIA').expect(403);
    await admin.post('/Media/').expect(403);
    await admin.post('/account/AVATAR').expect(403);
  });

  it('does not let the next person read what visitors wrote in the demo’s forms', async () => {
    await admin.get(`/forms/${id}/submissions`).expect(403);
    await admin.get(`/forms/${id}/submissions.csv`).expect(403);
  });

  it('leaves the account’s language, which is a browser’s setting', async () => {
    const response = await admin.patch('/account/language').send({});

    expect(response.status).not.toBe(403);
  });

  it('leaves what a publisher does: reading the site', async () => {
    const response = await admin.get('/sites/themes/available');

    expect(response.status).not.toBe(403);
  });
});
