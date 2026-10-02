import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FakeCaptchaPort, FakeNewsletterPort } from '@kometio/testing';
import { FormsModule } from '../forms/forms.module';
import { PagesModule } from '../pages/pages.module';
import { PublicFormsModule } from './public-forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { CAPTCHA_PORT, NEWSLETTER_PORT } from '../adapters/port.tokens';

/**
 * Runs against a real Postgres and a real SMTP relay (Mailpit in dev, see
 * docs/development.md). Combines FormsModule (to create a form the normal,
 * authenticated way) with PublicFormsModule under test, then reads/submits
 * it through the public endpoints with NO session — same reasoning as
 * public-pages.controller.integration.spec.ts.
 */
describe('PublicFormsController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;
  let newsletterPort: FakeNewsletterPort;

  beforeAll(async () => {
    newsletterPort = new FakeNewsletterPort();
    integration = await IntegrationApp.start({
      // PagesModule only to create a real page the normal way, so the
      // origin recorded below is a row the foreign key actually accepts.
      imports: [FormsModule, PagesModule, PublicFormsModule],
      // Cloudflare's siteverify and the newsletter provider are live third
      // parties, unlike Postgres and Mailpit: depending on them would make
      // this suite depend on their uptime. The fake newsletter port also
      // records what got subscribed, for the assertions below.
      overrideProviders: (builder) =>
        builder
          .overrideProvider(CAPTCHA_PORT)
          .useClass(FakeCaptchaPort)
          .overrideProvider(NEWSLETTER_PORT)
          .useValue(newsletterPort),
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
      .send({ siteId, name: 'Contatti' })
      .expect(201);
    const updateRes = await agent
      .patch(`/forms/${createRes.body.id}`)
      .send({ name: 'Contatti', fields, notificationEmails })
      .expect(200);
    return updateRes.body.id as string;
  }

  /** A real page, created the authenticated way — returns its translation's id. */
  async function createPage(title: string): Promise<string> {
    const groupRes = await agent
      .post('/page-groups')
      .send({ siteId, content: [] })
      .expect(201);
    const translationRes = await agent
      .post(`/page-groups/${groupRes.body.id}/translations`)
      .send({
        locale: 'it',
        slug: `contatti-${randomUUID()}`,
        seoMeta: { title, description: '' },
      })
      .expect(201);
    return translationRes.body.id as string;
  }

  it('serves a form definition without the notification email, without a session', async () => {
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      ['owner@example.com'],
    );

    const res = await request(app.getHttpServer())
      .get(`/public/forms/${formId}`)
      .expect(200);

    expect(res.body).toEqual({
      id: formId,
      name: 'Contatti',
      fields: [{ id: 'email', label: 'Email', type: 'email', required: true }],
      steps: [],
    });
    expect(res.body).not.toHaveProperty('notificationEmails');
  });

  it('404s reading a form that does not exist', async () => {
    await request(app.getHttpServer())
      .get(`/public/forms/${randomUUID()}`)
      .expect(404);
  });

  it('accepts a valid submission without a session', async () => {
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      ['owner@example.com'],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({
        values: { email: 'visitor@example.com' },
        honeypot: '',
        captchaToken: 'test-token',
      })
      .expect(204);
  });

  it('counts the answers on the form itself, not only in the list', async () => {
    // The form editor labels its Submissions tab from the form it loaded
    // and, after a save, from the PATCH response. Only the list used to
    // carry the count, so that label never appeared.
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      [],
    );
    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({
        values: { email: 'visitor@example.com' },
        honeypot: '',
        captchaToken: 'test-token',
      })
      .expect(204);

    const read = await agent.get(`/forms/${formId}`).expect(200);
    expect(read.body.submissionCount).toBe(1);

    const saved = await agent
      .patch(`/forms/${formId}`)
      .send({
        name: 'Contatti',
        fields: read.body.fields,
        notificationEmails: [],
      })
      .expect(200);
    expect(saved.body.submissionCount).toBe(1);
  });

  it('records which page the form was filled on, and names it when read back', async () => {
    // The whole path, not the pieces: the id travels in the request body
    // of an unauthenticated endpoint, is checked against the form's site,
    // goes into a foreign-key column that nothing had ever written, and
    // comes back named on the authenticated read.
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      [],
    );
    const pageTranslationId = await createPage('Contatti');

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({
        pageId: pageTranslationId,
        values: { email: 'visitor@example.com' },
        honeypot: '',
        captchaToken: 'test-token',
      })
      .expect(204);

    const read = await agent.get(`/forms/${formId}/submissions`).expect(200);
    expect(read.body.items[0].pageId).toBe(pageTranslationId);
    expect(read.body.pages).toEqual([
      {
        id: pageTranslationId,
        pageGroupId: expect.any(String),
        locale: 'it',
        title: 'Contatti',
      },
    ]);
  });

  it('keeps a submission whose page id belongs to nothing', async () => {
    // A foreign-key violation here would answer 500 and lose the answers
    // someone typed, over a field that is only ever a note in the margin.
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      [],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({
        pageId: randomUUID(),
        values: { email: 'visitor@example.com' },
        honeypot: '',
        captchaToken: 'test-token',
      })
      .expect(204);

    const read = await agent.get(`/forms/${formId}/submissions`).expect(200);
    expect(read.body.items[0].pageId).toBeNull();
    expect(read.body.pages).toEqual([]);
  });

  it('400s a submission missing a required field', async () => {
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      ['owner@example.com'],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ values: {}, honeypot: '', captchaToken: 'test-token' })
      .expect(400);
  });

  it('400s a submission with a missing or invalid CAPTCHA token', async () => {
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      ['owner@example.com'],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ values: { email: 'visitor@example.com' }, honeypot: '' })
      .expect(400);
  });

  it('silently accepts a honeypot-filled submission (204, not a distinguishing rejection)', async () => {
    const formId = await createForm(
      [{ id: 'email', label: 'Email', type: 'email', required: true }],
      ['owner@example.com'],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ values: {}, honeypot: 'i-am-a-bot' })
      .expect(204);
  });

  it('subscribes the submitted email when the newsletter-consent field is checked', async () => {
    const formId = await createForm(
      [
        { id: 'email', label: 'Email', type: 'email', required: true },
        {
          id: 'newsletter',
          label: 'Iscrivimi alla newsletter',
          type: 'newsletter-consent',
          required: false,
        },
      ],
      [],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({
        values: { email: 'newsletter-fan@example.com', newsletter: true },
        honeypot: '',
        captchaToken: 'test-token',
      })
      .expect(204);

    expect(newsletterPort.subscribedEmails).toContain(
      'newsletter-fan@example.com',
    );
  });

  it('404s submitting to a form that does not exist', async () => {
    await request(app.getHttpServer())
      .post(`/public/forms/${randomUUID()}/submissions`)
      .send({ values: {}, honeypot: '', captchaToken: 'test-token' })
      .expect(404);
  });

  it('uploads an attachment and returns its public URL and original filename', async () => {
    const formId = await createForm(
      [{ id: 'cv', label: 'Curriculum', type: 'file', required: false }],
      [],
    );

    const res = await request(app.getHttpServer())
      .post(`/public/forms/${formId}/attachments`)
      .attach('file', Buffer.from('%PDF-1.4 fake pdf'), 'cv.pdf')
      .expect(201);

    expect(res.body.filename).toBe('cv.pdf');
    expect(res.body.url).toContain('/uploads/attachments/');
  });

  it('400s an attachment upload with no file', async () => {
    const formId = await createForm(
      [{ id: 'cv', label: 'Curriculum', type: 'file', required: false }],
      [],
    );

    await request(app.getHttpServer())
      .post(`/public/forms/${formId}/attachments`)
      .expect(400);
  });

  it('404s an attachment upload for a form that does not exist', async () => {
    await request(app.getHttpServer())
      .post(`/public/forms/${randomUUID()}/attachments`)
      .attach('file', Buffer.from('data'), 'file.txt')
      .expect(404);
  });
});
