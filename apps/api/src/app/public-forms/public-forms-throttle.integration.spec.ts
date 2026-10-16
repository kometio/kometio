import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from '@kometio/api-contracts';
import { FormsModule } from '../forms/forms.module';
import { PublicFormsModule } from './public-forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { idOf } from '../../test/response-body.test-fixture';

const SERVICE_TOKEN = 'a-real-deployment-secret-of-some-length';

/**
 * Runs against a real Postgres — see docs/development.md. The public site
 * makes every call from its own server, so what is limited has to be the
 * visitor it vouches for, not the address it calls from: with the address, a
 * site read ten times a minute lost the form on the eleventh page view, and
 * ten answers a minute was the budget of everybody together.
 */
describe('PublicFormsController (integration): who the limits count', () => {
  const original = process.env['PUBLIC_API_SERVICE_TOKEN'];
  let integration: IntegrationApp;
  let formId: string;

  beforeAll(async () => {
    process.env['PUBLIC_API_SERVICE_TOKEN'] = SERVICE_TOKEN;
    integration = await IntegrationApp.start({
      imports: [FormsModule, PublicFormsModule],
    });
    const siteId = await integration.createSite();
    const owner = await integration.login(await integration.createUser());
    const created = await owner
      .post('/forms')
      .send({ siteId, name: 'Contatti' })
      .expect(201);
    const saved = await owner
      .patch(`/forms/${created.body.id}`)
      .send({
        name: 'Contatti',
        fields: [
          { id: 'email', label: 'Email', type: 'email', required: true },
        ],
        notificationEmails: [],
        // Not what is under test: an answer needs no solution to be sent.
        captchaEnabled: false,
      })
      .expect(200);
    formId = idOf(saved.body);
  });

  afterAll(async () => {
    await integration.close();
    if (original === undefined) delete process.env['PUBLIC_API_SERVICE_TOKEN'];
    else process.env['PUBLIC_API_SERVICE_TOKEN'] = original;
  });

  /** A request the public site makes on behalf of this visitor. */
  const asVisitor = (test: request.Test, visitorIp: string) =>
    test
      .set(PUBLIC_API_SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
      .set(PUBLIC_API_VISITOR_IP_HEADER, visitorIp);

  const server = () => integration.app.getHttpServer();

  it('lets one visitor view a page with the form far more than ten times a minute', async () => {
    for (let view = 0; view < 25; view++) {
      await asVisitor(
        request(server()).get(`/public/forms/${formId}`),
        '203.0.113.7',
      ).expect(200);
    }
  });

  it('gives each visitor their own ten answers a minute, and the eleventh of one is refused without costing the next', async () => {
    const answer = (visitorIp: string) =>
      asVisitor(
        request(server()).post(`/public/forms/${formId}/submissions`),
        visitorIp,
      ).send({
        values: { email: `${randomUUID()}@example.test` },
        honeypot: '',
        captchaToken: '',
      });

    for (let sent = 0; sent < 10; sent++) {
      await answer('198.51.100.4').expect(204);
    }
    await answer('198.51.100.4').expect(429);
    await answer('198.51.100.5').expect(204);
  });
});
