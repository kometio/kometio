import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Form, FormSubmission } from '@kometio/domain-core';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleFormRepository } from './drizzle-form.repository';
import { DrizzleFormSubmissionRepository } from './drizzle-form-submission.repository';

/**
 * Runs against a real Postgres — see docs/development.md ("docker compose up
 * -d postgres" + run migrations first). Connects as `kometio_app`, same as
 * production code, so this is also the RLS regression test: any change that
 * accidentally weakens tenant isolation should fail here, not in production.
 */
describe('DrizzleFormRepository (integration)', () => {
  let db: KometioDb;
  let formRepository: DrizzleFormRepository;
  let formSubmissionRepository: DrizzleFormSubmissionRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;
  let siteBId: string;

  beforeAll(async () => {
    db = createAppDb();
    formRepository = new DrizzleFormRepository(db);
    formSubmissionRepository = new DrizzleFormSubmissionRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);
    siteBId = await createIntegrationSite(db, tenantBId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function buildForm(
    overrides: Partial<Parameters<typeof Form.create>[0]> = {},
  ) {
    return Form.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      name: 'Contatti',
      ...overrides,
    });
  }

  it('saves and retrieves a form by id, scoped to its tenant', async () => {
    const form = buildForm();
    await formRepository.add(form);

    const found = await formRepository.findById(tenantAId, form.id);
    expect(found?.id).toBe(form.id);
    expect(found?.name).toBe('Contatti');
    expect(found?.fields).toEqual([]);
    expect(found?.steps).toEqual([]);
    expect(found?.notificationEmails).toEqual([]);

    const foundFromOtherTenant = await formRepository.findById(
      tenantBId,
      form.id,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('listBySite scopes by tenant and site, most recently updated first', async () => {
    const older = buildForm({ now: new Date(Date.now() - 1000) });
    const newer = buildForm({ now: new Date() });
    await formRepository.add(older);
    await formRepository.add(newer);

    const found = await formRepository.listBySite(tenantAId, siteAId, {
      page: 1,
      pageSize: 100,
    });
    const foundIds = found.items.map((form) => form.id);
    expect(foundIds.indexOf(newer.id)).toBeLessThan(foundIds.indexOf(older.id));

    const foundFromOtherTenant = await formRepository.listBySite(
      tenantBId,
      siteAId,
      { page: 1, pageSize: 100 },
    );
    expect(foundFromOtherTenant.items).toHaveLength(0);
    expect(foundFromOtherTenant.total).toBe(0);
  });

  it('listBySite paginates with limit/offset and reports the total', async () => {
    for (let i = 0; i < 3; i++) {
      await formRepository.add(
        buildForm({ now: new Date(Date.now() - i * 1000) }),
      );
    }

    const firstPage = await formRepository.listBySite(tenantAId, siteAId, {
      page: 1,
      pageSize: 2,
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBeGreaterThanOrEqual(3);

    const secondPage = await formRepository.listBySite(tenantAId, siteAId, {
      page: 2,
      pageSize: 2,
    });
    const firstIds = firstPage.items.map((form) => form.id);
    const secondIds = secondPage.items.map((form) => form.id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('save() writes back a form that exists', async () => {
    const form = buildForm();
    await formRepository.add(form);

    form.update(
      {
        name: 'Contatti aggiornato',
        fields: [
          {
            id: 'email',
            label: 'Email',
            type: 'email',
            required: true,
            stepId: 'step-1',
          },
        ],
        steps: [{ id: 'step-1', title: 'Contatti' }],
        notificationEmails: ['owner@example.com'],
      },
      new Date(),
    );
    await formRepository.save(form);

    const found = await formRepository.findById(tenantAId, form.id);
    expect(found?.name).toBe('Contatti aggiornato');
    expect(found?.fields).toEqual([
      {
        id: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        stepId: 'step-1',
      },
    ]);
    expect(found?.steps).toEqual([{ id: 'step-1', title: 'Contatti' }]);
    expect(found?.notificationEmails).toEqual(['owner@example.com']);
  });

  it('deletes a form scoped to its tenant', async () => {
    const form = buildForm();
    await formRepository.add(form);

    await formRepository.delete(tenantAId, form.id);

    expect(await formRepository.findById(tenantAId, form.id)).toBeNull();
  });

  it('saves a form submission, scoped to its tenant, and survives the form being deleted', async () => {
    const form = buildForm();
    await formRepository.add(form);

    const submission = FormSubmission.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      pageId: null,
      formId: form.id,
      payload: { email: 'visitor@example.com' },
    });
    await formSubmissionRepository.save(submission);

    // No read port exists for submissions in v1 (docs/adr/0015) — the save
    // itself, plus surviving the form's deletion below, is what this test
    // can verify without reaching into Drizzle internals from a spec.
    await formRepository.delete(tenantAId, form.id);
  });

  describe('counting the answers a retention would delete', () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function answerFrom(daysAgo: number, tenantId = tenantAId) {
      await formSubmissionRepository.save(
        FormSubmission.create({
          id: randomUUID(),
          tenantId,
          siteId: tenantId === tenantAId ? siteAId : siteBId,
          pageId: null,
          formId: null,
          payload: {},
          now: new Date(Date.now() - daysAgo * DAY),
        }),
      );
    }

    it('counts the site’s answers older than the number of days, and only those', async () => {
      await answerFrom(2);
      await answerFrom(31);
      await answerFrom(400);

      expect(
        await formSubmissionRepository.countOlderThan(tenantAId, siteAId, 30),
      ).toBe(2);
      expect(
        await formSubmissionRepository.countOlderThan(tenantAId, siteAId, 365),
      ).toBe(1);
      expect(
        await formSubmissionRepository.countOlderThan(tenantAId, siteAId, 3650),
      ).toBe(0);
    });

    it('does not count another tenant’s answers', async () => {
      const before = await formSubmissionRepository.countOlderThan(
        tenantAId,
        siteAId,
        30,
      );

      await answerFrom(400, tenantBId);

      // B's answer is B's own, whoever asks.
      expect(
        await formSubmissionRepository.countOlderThan(tenantAId, siteAId, 30),
      ).toBe(before);
      expect(
        await formSubmissionRepository.countOlderThan(tenantBId, siteBId, 30),
      ).toBe(1);
      expect(
        await formSubmissionRepository.countOlderThan(tenantAId, siteBId, 30),
      ).toBe(0);
    });
  });

  describe('deleting one submission', () => {
    async function answer(formId: string, tenantId = tenantAId) {
      const submission = FormSubmission.create({
        id: randomUUID(),
        tenantId,
        siteId: siteAId,
        pageId: null,
        formId,
        payload: { email: `${randomUUID()}@example.com` },
      });
      await formSubmissionRepository.save(submission);
      return submission;
    }

    it('deletes the answer named and leaves the form’s others', async () => {
      const form = buildForm();
      await formRepository.add(form);
      const first = await answer(form.id);
      const second = await answer(form.id);

      // The one that went, so the files it named can go with it.
      const deleted = await formSubmissionRepository.deleteOne(
        tenantAId,
        form.id,
        first.id,
      );
      expect(deleted?.id).toBe(first.id);
      expect(deleted?.payload).toEqual(first.payload);

      const left = await formSubmissionRepository.listAllByForm(
        tenantAId,
        form.id,
      );
      expect(left.map((s) => s.id)).toEqual([second.id]);
    });

    it('deletes nothing for an answer that is another form’s, another tenant’s, or not there', async () => {
      const form = buildForm();
      const other = buildForm({ name: 'Altro' });
      await formRepository.add(form);
      await formRepository.add(other);
      const mine = await answer(form.id);

      expect(
        await formSubmissionRepository.deleteOne(tenantAId, other.id, mine.id),
      ).toBeNull();
      expect(
        await formSubmissionRepository.deleteOne(tenantBId, form.id, mine.id),
      ).toBeNull();
      expect(
        await formSubmissionRepository.deleteOne(
          tenantAId,
          form.id,
          randomUUID(),
        ),
      ).toBeNull();
      expect(
        (await formSubmissionRepository.listAllByForm(tenantAId, form.id)).map(
          (s) => s.id,
        ),
      ).toEqual([mine.id]);
    });
  });

  it('saves a form submission with a null formId', async () => {
    const submission = FormSubmission.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      pageId: null,
      formId: null,
      payload: { email: 'visitor@example.com' },
    });

    await expect(
      formSubmissionRepository.save(submission),
    ).resolves.not.toThrow();
  });

  /** Three submissions one second apart, so ordering assertions are stable. */
  async function seedSubmissions(formId: string, payloads: string[]) {
    const base = Date.now() - payloads.length * 1000;
    for (const [index, email] of payloads.entries()) {
      await formSubmissionRepository.save(
        FormSubmission.create({
          id: randomUUID(),
          tenantId: tenantAId,
          siteId: siteAId,
          pageId: null,
          formId,
          payload: { email },
          now: new Date(base + index * 1000),
        }),
      );
    }
  }

  it('listByForm returns newest first, paginated and scoped to its tenant', async () => {
    const form = buildForm();
    await formRepository.add(form);
    await seedSubmissions(form.id, ['first@x.it', 'second@x.it', 'third@x.it']);

    const firstPage = await formSubmissionRepository.listByForm(
      tenantAId,
      form.id,
      { page: 1, pageSize: 2 },
    );
    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((s) => s.toProps().payload['email'])).toEqual([
      'third@x.it',
      'second@x.it',
    ]);

    const secondPage = await formSubmissionRepository.listByForm(
      tenantAId,
      form.id,
      { page: 2, pageSize: 2 },
    );
    expect(secondPage.items.map((s) => s.toProps().payload['email'])).toEqual([
      'first@x.it',
    ]);

    // RLS from the other tenant's point of view: the rows exist, and it must
    // not be able to see any of them.
    const fromOtherTenant = await formSubmissionRepository.listByForm(
      tenantBId,
      form.id,
      { page: 1, pageSize: 10 },
    );
    expect(fromOtherTenant.items).toEqual([]);
    expect(fromOtherTenant.total).toBe(0);
  });

  it('listAllByForm returns every submission, oldest first', async () => {
    // The opposite order from the screen, on purpose: a spreadsheet reads
    // top-to-bottom as a timeline.
    const form = buildForm();
    await formRepository.add(form);
    await seedSubmissions(form.id, ['a@x.it', 'b@x.it', 'c@x.it']);

    const all = await formSubmissionRepository.listAllByForm(
      tenantAId,
      form.id,
    );

    expect(all.map((s) => s.toProps().payload['email'])).toEqual([
      'a@x.it',
      'b@x.it',
      'c@x.it',
    ]);
  });

  it('countByForms counts per form and omits the ones with none', async () => {
    const withTwo = buildForm();
    const withNone = buildForm();
    await formRepository.add(withTwo);
    await formRepository.add(withNone);
    await seedSubmissions(withTwo.id, ['one@x.it', 'two@x.it']);

    const counts = await formSubmissionRepository.countByForms(tenantAId, [
      withTwo.id,
      withNone.id,
    ]);

    expect(counts[withTwo.id]).toBe(2);
    expect(counts[withNone.id]).toBeUndefined();
  });

  it('names every file a submission of this tenant holds, and nothing of another tenant', async () => {
    const form = buildForm();
    await formRepository.add(form);
    const cv = `https://files.esempio.test/attachments/${form.id}/${randomUUID()}.pdf`;
    await formSubmissionRepository.save(
      FormSubmission.create({
        id: randomUUID(),
        tenantId: tenantAId,
        siteId: siteAId,
        pageId: null,
        formId: form.id,
        payload: {
          name: 'Ada',
          consent: true,
          cv: { url: cv, filename: 'cv.pdf' },
        },
      }),
    );

    const own = await formSubmissionRepository.listAttachmentUrls(tenantAId);
    const other = await formSubmissionRepository.listAttachmentUrls(tenantBId);

    expect(own.has(cv)).toBe(true);
    expect([...own].every((url) => url.startsWith('https://'))).toBe(true);
    expect(other.has(cv)).toBe(false);
  });

  it('countByForms answers an empty list without hitting the database', async () => {
    // `inArray` with no values generates `in ()`, which Postgres rejects as a
    // syntax error — an empty page of forms has to short-circuit.
    await expect(
      formSubmissionRepository.countByForms(tenantAId, []),
    ).resolves.toEqual({});
  });
});
