import { access, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { storedAttachmentPathOf } from '@kometio/ports';
import { requireEnv } from '@kometio/env-config';
import { FakeCaptchaPort } from '@kometio/testing';
import { FormsModule } from '../forms/forms.module';
import { PublicFormsModule } from '../public-forms/public-forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';
import { MaintenanceModule } from './maintenance.module';
import { FormAttachmentsSweepService } from './form-attachments-sweep.service';
import { CAPTCHA_PORT } from '../adapters/port.tokens';

/**
 * The night's sweep, end to end: files written by the real local store,
 * a submission in the real database, and the service that runs at 5 AM.
 */
describe('FormAttachmentsSweepService (integration)', () => {
  let integration: IntegrationApp;

  beforeAll(async () => {
    integration = await IntegrationApp.start({
      imports: [FormsModule, PublicFormsModule, MaintenanceModule],
      overrideProviders: (builder) =>
        builder.overrideProvider(CAPTCHA_PORT).useClass(FakeCaptchaPort),
    });
  });

  afterAll(async () => {
    await integration.close();
  });

  function pathOnDisk(url: string): string {
    const stored = storedAttachmentPathOf(url);
    if (!stored) throw new Error(`not a stored attachment: ${url}`);
    return join(requireEnv('MEDIA_UPLOAD_DIR'), 'attachments', stored);
  }

  const exists = (path: string) =>
    access(path).then(
      () => true,
      () => false,
    );

  it('removes an old upload no submission names, and keeps the one that is named', async () => {
    const siteId = await integration.createSite();
    const agent = await integration.login(await integration.createUser());
    const created = await agent
      .post('/forms')
      .send({ siteId, name: 'Candidature' })
      .expect(201);
    const formId = String(created.body.id);
    await agent
      .patch(`/forms/${formId}`)
      .send({
        name: 'Candidature',
        fields: [{ id: 'cv', label: 'CV', type: 'file', required: true }],
        notificationEmails: [],
      })
      .expect(200);
    const upload = async () =>
      (
        await request(integration.app.getHttpServer())
          .post(`/public/forms/${formId}/attachments`)
          .attach('file', Buffer.from('%PDF-1.4 invented'), 'cv.pdf')
          .expect(201)
      ).body;
    const sent = await upload();
    const abandoned = await upload();
    await request(integration.app.getHttpServer())
      .post(`/public/forms/${formId}/submissions`)
      .send({ values: { cv: sent }, captchaToken: 'token' })
      .expect(204);
    // Both older than the day an upload is given to be sent.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const file of [sent, abandoned]) {
      await utimes(pathOnDisk(file.url), twoDaysAgo, twoDaysAgo);
    }

    await integration.app.get(FormAttachmentsSweepService).sweep();

    expect(await exists(pathOnDisk(sent.url))).toBe(true);
    expect(await exists(pathOnDisk(abandoned.url))).toBe(false);
  });
});
