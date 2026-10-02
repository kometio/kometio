import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FakeCaptchaPort } from '@kometio/testing';
import { FormsModule } from '../forms/forms.module';
import { PublicFormsModule } from './public-forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { CAPTCHA_PORT } from '../adapters/port.tokens';

/**
 * What a public submission's answers may be, against a real Postgres and
 * the real attachment store. Its own app, not a describe inside
 * public-forms.controller.integration.spec.ts: the public endpoints allow
 * ten requests a minute each, and that suite already spends most of them.
 */
describe('PublicFormsController — what an answer may be (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [FormsModule, PublicFormsModule],
      overrideProviders: (builder) =>
        builder.overrideProvider(CAPTCHA_PORT).useClass(FakeCaptchaPort),
    });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  async function createForm(fields: unknown[], notificationEmails: string[]) {
    const createRes = await agent
      .post('/forms')
      .send({ siteId, name: 'Candidature' })
      .expect(201);
    await agent
      .patch(`/forms/${createRes.body.id}`)
      .send({ name: 'Candidature', fields, notificationEmails })
      .expect(200);
    return String(createRes.body.id);
  }

  /*
   * A file answer is the url the upload handed back, returned by the
   * visitor's browser: only one of this form's own uploads is believed,
   * or the site owner's notification email carries a link of the
   * visitor's choosing.
   */
  describe('a file answer', () => {
    const fileField = [
      { id: 'cv', label: 'Curriculum', type: 'file', required: true },
    ];

    async function upload(formId: string) {
      const res = await request(app.getHttpServer())
        .post(`/public/forms/${formId}/attachments`)
        .attach('file', Buffer.from('%PDF-1.4 fake pdf'), 'cv.pdf')
        .expect(201);
      return res.body;
    }

    function submit(formId: string, values: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post(`/public/forms/${formId}/submissions`)
        .send({ values, captchaToken: 'token' });
    }

    it('is accepted when it is this form’s own upload', async () => {
      const formId = await createForm(fileField, []);

      await submit(formId, { cv: await upload(formId) }).expect(204);
    });

    it('is refused when it was uploaded for another form', async () => {
      const formId = await createForm(fileField, []);
      const otherFormId = await createForm(fileField, []);

      await submit(formId, { cv: await upload(otherFormId) }).expect(400);
    });

    it('is refused when it points anywhere else', async () => {
      const formId = await createForm(fileField, []);

      await submit(formId, {
        cv: { url: 'https://evil.example/cv.pdf', filename: 'cv.pdf' },
      }).expect(400);
    });
  });

  it('400s an answer that is not what its field takes', async () => {
    const formId = await createForm(
      [{ id: 'name', label: 'Nome', type: 'text', required: true }],
      [],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ values: { name: {} }, captchaToken: 'token' })
      .expect(400);
  });
});
