import request from 'supertest';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { DeploymentModule } from './deployment.module';

/** Runs against a real Postgres — see docs/development.md. */
describe('DeploymentController (integration)', () => {
  let integration: IntegrationApp;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [DeploymentModule] });
  });

  afterAll(async () => {
    await integration.close();
  });

  it('is for whoever is signed in: 401 without a session', async () => {
    await request(integration.app.getHttpServer())
      .get('/deployment')
      .expect(401);
  });

  it('answers a signed-in person with what the server can do', async () => {
    const agent = await integration.login(
      await integration.createUser({ role: 'editor' }),
    );

    const response = await agent.get('/deployment').expect(200);

    expect(response.body).toEqual({ emailConfigured: expect.any(Boolean) });
  });
});
