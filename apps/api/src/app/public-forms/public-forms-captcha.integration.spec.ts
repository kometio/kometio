import request from 'supertest';
import { type INestApplication } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module';
import { PublicFormsModule } from './public-forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { idOf } from '../../test/response-body.test-fixture';

/**
 * Runs against a real Postgres — see docs/development.md. Whether a form
 * asks for the captcha is the form's own choice, kept and enforced by the
 * server (docs/adr/0145). Its own file: the public routes are limited to ten
 * a minute, and the other spec of this controller already spends most of them.
 * The captcha is the fixture's fake, which takes any token that is not empty.
 */
describe('PublicFormsController (integration): the captcha of a form', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [FormsModule, PublicFormsModule],
    });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  const emailField = [
    { id: 'email', label: 'Email', type: 'email', required: true },
  ];

  async function createForm(captchaEnabled?: boolean) {
    const createRes = await agent
      .post('/forms')
      .send({ siteId, name: 'Contatti' })
      .expect(201);
    const updateRes = await agent
      .patch(`/forms/${createRes.body.id}`)
      .send({
        name: 'Contatti',
        fields: emailField,
        notificationEmails: [],
        captchaEnabled,
      })
      .expect(200);
    return idOf(updateRes.body);
  }

  const answer = (captchaToken: string) => ({
    values: { email: 'visitor@example.com' },
    honeypot: '',
    captchaToken,
  });

  it('asks for one by default: a form saved without saying so refuses an answer with no solution', async () => {
    const formId = await createForm();

    const res = await request(app.getHttpServer())
      .get(`/public/forms/${formId}`)
      .expect(200);
    expect(res.body.captchaEnabled).toBe(true);
    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send(answer(''))
      .expect(400);
  });

  it('takes an answer with no solution once the owner has turned it off, and tells the page not to draw the widget', async () => {
    const formId = await createForm(false);

    const res = await request(app.getHttpServer())
      .get(`/public/forms/${formId}`)
      .expect(200);
    expect(res.body.captchaEnabled).toBe(false);
    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send(answer(''))
      .expect(204);

    const read = await agent.get(`/forms/${formId}`).expect(200);
    expect(read.body.captchaEnabled).toBe(false);
    expect(read.body.submissionCount).toBe(1);
  });

  it('still drops what the honeypot catches when the form asks for no captcha', async () => {
    const formId = await createForm(false);

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ ...answer(''), honeypot: 'i-am-a-bot' })
      .expect(204);

    const read = await agent.get(`/forms/${formId}`).expect(200);
    expect(read.body.submissionCount).toBe(0);
  });

  it('asks again when a PATCH that does not mention the choice replaces the form: the safe answer to a client that never heard of it', async () => {
    const formId = await createForm(false);

    const saved = await agent
      .patch(`/forms/${formId}`)
      .send({ name: 'Contatti', fields: emailField, notificationEmails: [] })
      .expect(200);

    expect(saved.body.captchaEnabled).toBe(true);
  });

  it('is kept by a copy of the form', async () => {
    const formId = await createForm(false);

    const copy = await agent
      .post(`/forms/${formId}/duplicate`)
      .send({ name: 'Copia' })
      .expect(201);

    expect(copy.body.captchaEnabled).toBe(false);
  });
});
