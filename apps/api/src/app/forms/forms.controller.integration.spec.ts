import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { AttachmentStoragePort } from '@kometio/ports';
import { formSubmissions, withTenant } from '@kometio/postgres-db';
import { ATTACHMENT_STORAGE } from '../adapters/port.tokens';
import { FormsModule } from './forms.module';
import { IntegrationApp } from '../../test/integration-app.test-fixture';

/**
 * Runs against a real Postgres — see docs/development.md. Same
 * throwaway-site-under-DEFAULT_TENANT_ID isolation as
 * pages.controller.integration.spec.ts.
 */
describe('FormsController (integration)', () => {
  let integration: IntegrationApp;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let siteId: string;

  beforeAll(async () => {
    integration = await IntegrationApp.start({ imports: [FormsModule] });
    app = integration.app;
    siteId = await integration.createSite();
    agent = await integration.login(await integration.createUser());
  });

  afterAll(async () => {
    await integration.close();
  });

  it('creates, reads, updates, lists and deletes a form', async () => {
    const createRes = await agent
      .post('/forms')
      .send({ siteId, name: 'Contatti' })
      .expect(201);
    expect(createRes.body.name).toBe('Contatti');
    expect(createRes.body.fields).toEqual([]);
    expect(createRes.body.steps).toEqual([]);
    const formId = createRes.body.id;

    const getRes = await agent.get(`/forms/${formId}`).expect(200);
    expect(getRes.body.id).toBe(formId);

    const updateRes = await agent
      .patch(`/forms/${formId}`)
      .send({
        name: 'Richiedi preventivo',
        fields: [
          { id: 'email', label: 'Email', type: 'email', required: true },
        ],
        notificationEmails: ['owner@example.com'],
      })
      .expect(200);
    expect(updateRes.body.name).toBe('Richiedi preventivo');
    expect(updateRes.body.fields).toHaveLength(1);
    expect(updateRes.body.notificationEmails).toEqual(['owner@example.com']);

    const listRes = await agent.get('/forms').query({ siteId }).expect(200);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);
    expect(listRes.body.items.map((f: { id: string }) => f.id)).toContain(
      formId,
    );

    await agent.delete(`/forms/${formId}`).expect(204);
    await agent.get(`/forms/${formId}`).expect(404);
  });

  it('404s reading a form that does not exist', async () => {
    await agent.get(`/forms/${randomUUID()}`).expect(404);
  });

  // A malformed id is the caller's mistake, said where the request is read:
  // it used to reach a uuid column and come back as a 500 from Postgres.
  it('400s an id that is not a uuid', async () => {
    await agent.get('/forms/not-a-uuid').expect(400);
  });

  it('persists steps and per-field stepId assignments across the real HTTP+DB stack', async () => {
    const createRes = await agent
      .post('/forms')
      .send({ siteId, name: 'Candidatura' })
      .expect(201);
    const formId = createRes.body.id;

    const updateRes = await agent
      .patch(`/forms/${formId}`)
      .send({
        name: 'Candidatura',
        fields: [
          {
            id: 'nome',
            label: 'Nome',
            type: 'text',
            required: true,
            stepId: 'dati-personali',
          },
        ],
        steps: [{ id: 'dati-personali', title: 'Dati personali' }],
        notificationEmails: [],
      })
      .expect(200);

    expect(updateRes.body.steps).toEqual([
      { id: 'dati-personali', title: 'Dati personali' },
    ]);
    expect(updateRes.body.fields[0].stepId).toBe('dati-personali');

    const getRes = await agent.get(`/forms/${formId}`).expect(200);
    expect(getRes.body.steps).toEqual([
      { id: 'dati-personali', title: 'Dati personali' },
    ]);

    await agent.delete(`/forms/${formId}`).expect(204);
  });

  it('404s updating a form that does not exist', async () => {
    await agent
      .patch(`/forms/${randomUUID()}`)
      .send({ name: 'x', fields: [], notificationEmails: [] })
      .expect(404);
  });

  describe('duplicating a form', () => {
    it('copies the structure under the name given, and none of the answers', async () => {
      const created = await agent
        .post('/forms')
        .send({ siteId, name: 'Contatti' })
        .expect(201);
      const formId = created.body.id as string;
      await agent
        .patch(`/forms/${formId}`)
        .send({
          name: 'Contatti',
          fields: [
            { id: 'email', label: 'Email', type: 'email', required: true },
          ],
          notificationEmails: ['owner@example.com'],
        })
        .expect(200);
      await withTenant(integration.db, integration.tenantId, (tx) =>
        tx.insert(formSubmissions).values({
          id: randomUUID(),
          tenantId: integration.tenantId,
          siteId,
          formId,
          pageId: null,
          payload: { email: 'visitor@example.test' },
        }),
      );

      const copy = await agent
        .post(`/forms/${formId}/duplicate`)
        .send({ name: 'Copia di Contatti' })
        .expect(201);

      expect(copy.body.id).not.toBe(formId);
      expect(copy.body.name).toBe('Copia di Contatti');
      expect(copy.body.fields).toHaveLength(1);
      expect(copy.body.notificationEmails).toEqual(['owner@example.com']);
      expect(copy.body.submissionCount).toBe(0);
      // What the database holds agrees, and the original kept its answer.
      const listed = await agent.get('/forms').query({ siteId }).expect(200);
      const byId = new Map(
        listed.body.items.map((f: { id: string }) => [f.id, f]),
      );
      expect(byId.get(copy.body.id)).toMatchObject({
        name: 'Copia di Contatti',
        submissionCount: 0,
      });
      expect(byId.get(formId)).toMatchObject({ submissionCount: 1 });
    });

    it('404s a form that does not exist, and 400s no name and a bad id', async () => {
      await agent
        .post(`/forms/${randomUUID()}/duplicate`)
        .send({ name: 'X' })
        .expect(404);
      const created = await agent
        .post('/forms')
        .send({ siteId, name: 'Per errori' })
        .expect(201);
      await agent
        .post(`/forms/${created.body.id}/duplicate`)
        .send({})
        .expect(400);
      await agent
        .post('/forms/not-a-uuid/duplicate')
        .send({ name: 'X' })
        .expect(400);
    });
  });

  describe('deleting one submission', () => {
    async function formWithAnswers(count: number) {
      const form = await agent
        .post('/forms')
        .send({ siteId, name: `Con risposte ${randomUUID().slice(0, 6)}` })
        .expect(201);
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const id = randomUUID();
        ids.push(id);
        await withTenant(integration.db, integration.tenantId, (tx) =>
          tx.insert(formSubmissions).values({
            id,
            tenantId: integration.tenantId,
            siteId,
            formId: form.body.id,
            pageId: null,
            payload: { email: `${id}@example.test` },
          }),
        );
      }
      return { formId: form.body.id as string, ids };
    }

    it('deletes one answer, and the list and the count show it gone', async () => {
      const { formId, ids } = await formWithAnswers(3);

      await agent.delete(`/forms/${formId}/submissions/${ids[0]}`).expect(204);

      const list = await agent.get(`/forms/${formId}/submissions`).expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id).sort()).toEqual(
        [ids[1], ids[2]].sort(),
      );
      expect(list.body.total).toBe(2);
      const form = await agent.get(`/forms/${formId}`).expect(200);
      expect(form.body.submissionCount).toBe(2);
    });

    /** A file in the real attachment store, named by the answers that are given its url. */
    async function storedFile(formId: string) {
      const stored = await app
        .get<AttachmentStoragePort>(ATTACHMENT_STORAGE)
        .upload({
          formId,
          filename: 'cv.pdf',
          mimeType: 'application/pdf',
          extension: 'pdf',
          data: Buffer.from('%PDF-1.4 invented'),
        });
      return { url: stored.url, filename: stored.filename };
    }
    async function isStored(url: string) {
      for await (const file of app
        .get<AttachmentStoragePort>(ATTACHMENT_STORAGE)
        .listStored()) {
        if (file.url === url) return true;
      }
      return false;
    }
    async function answerNaming(
      formId: string,
      file: { url: string; filename: string },
    ) {
      const id = randomUUID();
      await withTenant(integration.db, integration.tenantId, (tx) =>
        tx.insert(formSubmissions).values({
          id,
          tenantId: integration.tenantId,
          siteId,
          formId,
          pageId: null,
          payload: { cv: file },
        }),
      );
      return id;
    }

    it('removes the file the answer carried, at once — not at the night’s sweep', async () => {
      const { formId } = await formWithAnswers(0);
      const file = await storedFile(formId);
      const id = await answerNaming(formId, file);
      expect(await isStored(file.url)).toBe(true);

      await agent.delete(`/forms/${formId}/submissions/${id}`).expect(204);

      expect(await isStored(file.url)).toBe(false);
    });

    it('keeps a file that another answer still names', async () => {
      const { formId } = await formWithAnswers(0);
      const file = await storedFile(formId);
      const first = await answerNaming(formId, file);
      await answerNaming(formId, file);

      await agent.delete(`/forms/${formId}/submissions/${first}`).expect(204);

      expect(await isStored(file.url)).toBe(true);
      // The test's own tidy-up: nothing else would remove a file the suite made.
      await app.get<AttachmentStoragePort>(ATTACHMENT_STORAGE).delete(file.url);
    });

    it('404s the same answer a second time', async () => {
      const { formId, ids } = await formWithAnswers(1);
      await agent.delete(`/forms/${formId}/submissions/${ids[0]}`).expect(204);

      await agent.delete(`/forms/${formId}/submissions/${ids[0]}`).expect(404);
    });

    it('404s an answer under another form, and deletes nothing', async () => {
      const mine = await formWithAnswers(1);
      const other = await formWithAnswers(1);

      await agent
        .delete(`/forms/${other.formId}/submissions/${mine.ids[0]}`)
        .expect(404);

      const list = await agent
        .get(`/forms/${mine.formId}/submissions`)
        .expect(200);
      expect(list.body.total).toBe(1);
    });

    it('404s under a form that does not exist, and 400s an id that is not a uuid', async () => {
      await agent
        .delete(`/forms/${randomUUID()}/submissions/${randomUUID()}`)
        .expect(404);
      await agent.delete(`/forms/${randomUUID()}/submissions/nope`).expect(400);
    });

    it('403s an editor, who may not delete', async () => {
      const { formId, ids } = await formWithAnswers(1);
      const editor = await integration.login(
        await integration.createUser({ role: 'editor' }),
      );

      await editor.delete(`/forms/${formId}/submissions/${ids[0]}`).expect(403);

      const list = await agent.get(`/forms/${formId}/submissions`).expect(200);
      expect(list.body.total).toBe(1);
    });
  });

  it('404s deleting a form that does not exist', async () => {
    await agent.delete(`/forms/${randomUUID()}`).expect(404);
  });

  it('401s without a session cookie', async () => {
    await request(app.getHttpServer())
      .get('/forms')
      .query({ siteId })
      .expect(401);
  });
});
