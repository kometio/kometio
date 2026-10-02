import { describe, expect, it, vi } from 'vitest';
import {
  FormSubmission,
  SiteNotFoundError,
  PageTranslation,
} from '@kometio/domain-core';
import {
  InMemoryFormRepository,
  InMemoryFormSubmissionRepository,
  InMemoryPageTranslationRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';
import { createForm } from './create-form.use-case';
import { countSubmissionsOlderThan } from './count-submissions-older-than.use-case';
import {
  countFormSubmissions,
  exportFormSubmissions,
  listFormSubmissions,
} from './list-form-submissions.use-case';

describe('listFormSubmissions origin pages', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup() {
    return {
      formRepository: new InMemoryFormRepository(),
      siteRepository: new InMemorySiteRepository(buildSite()),
      formSubmissionRepository: new InMemoryFormSubmissionRepository(),
      pageTranslationRepository: new InMemoryPageTranslationRepository(),
    };
  }

  async function seedPage(
    deps: ReturnType<typeof setup>,
    id: string,
    title: string,
    locale = 'it',
  ) {
    const translation = PageTranslation.create({
      id,
      tenantId,
      siteId,
      pageGroupId: `group-${id}`,
      locale,
      slug: title.toLowerCase(),
      seoMeta: { title, description: '' },
      createdBy: null,
    });
    await deps.pageTranslationRepository.add(translation, null);
    return translation;
  }

  async function seedSubmission(
    deps: ReturnType<typeof setup>,
    formId: string,
    pageId: string | null,
    at: string,
  ) {
    await deps.formSubmissionRepository.save(
      FormSubmission.create({
        id: `sub-${at}`,
        tenantId,
        siteId,
        pageId,
        formId,
        payload: { email: 'visitor@example.com' },
        now: new Date(at),
      }),
    );
  }

  it('names each page once however many submissions share it', async () => {
    // The point of the distinct set: a newsletter box in the footer is on
    // every page, and a contact form is on one. Reading the page per
    // submission would be a query per row for no extra information.
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Contatti',
    });
    await seedPage(deps, 'pt-1', 'Contatti');
    await seedSubmission(deps, form.id, 'pt-1', '2026-03-01T10:00:00.000Z');
    await seedSubmission(deps, form.id, 'pt-1', '2026-03-02T10:00:00.000Z');
    await seedSubmission(deps, form.id, 'pt-1', '2026-03-03T10:00:00.000Z');
    const reads = vi.spyOn(deps.pageTranslationRepository, 'findById');

    const result = await listFormSubmissions(deps, {
      tenantId,
      formId: form.id,
      page: 1,
      pageSize: 20,
    });

    expect(result.pages).toEqual([
      {
        id: 'pt-1',
        pageGroupId: 'group-pt-1',
        locale: 'it',
        title: 'Contatti',
      },
    ]);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('returns nothing for submissions that carry no page', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Contatti',
    });
    await seedSubmission(deps, form.id, null, '2026-03-01T10:00:00.000Z');

    const result = await listFormSubmissions(deps, {
      tenantId,
      formId: form.id,
      page: 1,
      pageSize: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.pages).toEqual([]);
  });

  it('leaves out a page that no longer exists', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Contatti',
    });
    await seedSubmission(deps, form.id, 'pt-gone', '2026-03-01T10:00:00.000Z');

    const result = await listFormSubmissions(deps, {
      tenantId,
      formId: form.id,
      page: 1,
      pageSize: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.pages).toEqual([]);
  });

  it('names only the pages on the requested page of submissions', async () => {
    // A page of results carries the pages that page needs, not the whole
    // form's history — otherwise the first request would read every page
    // the form has ever been on.
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Contatti',
    });
    await seedPage(deps, 'pt-1', 'Contatti');
    await seedPage(deps, 'pt-2', 'Chi siamo');
    await seedSubmission(deps, form.id, 'pt-1', '2026-03-01T10:00:00.000Z');
    await seedSubmission(deps, form.id, 'pt-2', '2026-03-02T10:00:00.000Z');

    const newest = await listFormSubmissions(deps, {
      tenantId,
      formId: form.id,
      page: 1,
      pageSize: 1,
    });

    expect(newest.pages.map((page) => page.title)).toEqual(['Chi siamo']);
  });

  it('gives the export every page its submissions came from', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Contatti',
    });
    await seedPage(deps, 'pt-1', 'Contatti');
    await seedPage(deps, 'pt-2', 'Chi siamo', 'en');
    await seedSubmission(deps, form.id, 'pt-1', '2026-03-01T10:00:00.000Z');
    await seedSubmission(deps, form.id, 'pt-2', '2026-03-02T10:00:00.000Z');

    const result = await exportFormSubmissions(deps, {
      tenantId,
      formId: form.id,
    });

    expect(
      result.pages.map((page) => `${page.title} (${page.locale})`),
    ).toEqual(['Contatti (it)', 'Chi siamo (en)']);
  });
});

describe('countFormSubmissions', () => {
  it('counts the answers of every form asked about, at once', async () => {
    const formSubmissionRepository = new InMemoryFormSubmissionRepository();
    for (const [id, formId] of [
      ['s1', 'form-1'],
      ['s2', 'form-1'],
      ['s3', 'form-2'],
    ]) {
      await formSubmissionRepository.save(
        FormSubmission.create({
          id,
          tenantId: 'tenant-1',
          siteId: 'site-1',
          pageId: null,
          formId,
          payload: {},
          now: new Date('2026-09-01T10:00:00Z'),
        }),
      );
    }

    const counts = await countFormSubmissions(
      { formSubmissionRepository },
      { tenantId: 'tenant-1', formIds: ['form-1', 'form-2'] },
    );

    expect(counts['form-1']).toBe(2);
    expect(counts['form-2']).toBe(1);
  });
});

describe('countSubmissionsOlderThan', () => {
  const tenantId = 'tenant-1';
  const DAY = 24 * 60 * 60 * 1000;

  async function setup() {
    const deps = {
      siteRepository: new InMemorySiteRepository(
        buildSite(),
        buildSite({ id: 'site-2', domain: 'altro.example' }),
      ),
      formSubmissionRepository: new InMemoryFormSubmissionRepository(),
    };
    const answer = (id: string, siteId: string, daysAgo: number) =>
      deps.formSubmissionRepository.save(
        FormSubmission.create({
          id,
          tenantId,
          siteId,
          pageId: null,
          formId: null,
          payload: {},
          now: new Date(Date.now() - daysAgo * DAY),
        }),
      );
    await answer('recent', 'site-1', 2);
    await answer('month', 'site-1', 31);
    await answer('year', 'site-1', 400);
    await answer('other-site', 'site-2', 400);
    return deps;
  }

  it('counts the answers a retention of that many days would delete, and no others', async () => {
    const deps = await setup();

    expect(
      await countSubmissionsOlderThan(deps, {
        tenantId,
        siteId: 'site-1',
        olderThanDays: 30,
      }),
    ).toBe(2);
    expect(
      await countSubmissionsOlderThan(deps, {
        tenantId,
        siteId: 'site-1',
        olderThanDays: 365,
      }),
    ).toBe(1);
    expect(
      await countSubmissionsOlderThan(deps, {
        tenantId,
        siteId: 'site-1',
        olderThanDays: 1000,
      }),
    ).toBe(0);
  });

  it('counts the site’s own answers only', async () => {
    const deps = await setup();

    expect(
      await countSubmissionsOlderThan(deps, {
        tenantId,
        siteId: 'site-2',
        olderThanDays: 30,
      }),
    ).toBe(1);
  });

  it('says not found for a site that is not this tenant’s', async () => {
    const deps = await setup();

    await expect(
      countSubmissionsOlderThan(deps, {
        tenantId: 'tenant-2',
        siteId: 'site-1',
        olderThanDays: 30,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});
