import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { AuthModule } from '../auth/auth.module';
import { DeploymentModule } from './deployment.module';

/** Runs against a real Postgres — see docs/development.md. */
describe('DeploymentController (integration)', () => {
  let integration: IntegrationApp;

  beforeAll(async () => {
    // AuthModule only brings the database the fixture reads its tenant from:
    // the route itself needs neither.
    integration = await IntegrationApp.start({
      imports: [DeploymentModule, AuthModule],
    });
  });

  afterAll(async () => {
    await integration.close();
  });

  // The forgot-password screen is shown before there is a session, and is the
  // first place that has to say that no email will come.
  it('answers without a session, with nothing but what the server can do', async () => {
    const response = await request(integration.app.getHttpServer())
      .get('/deployment')
      .expect(200);

    expect(response.body).toEqual({ emailConfigured: expect.any(Boolean) });
  });
});
