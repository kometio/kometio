import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PageGroup,
  PageTranslation,
  ReusableSection,
} from '@kometio/domain-core';
import { sectionOverrideKey, type PageContent } from '@kometio/shared-types';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemoryReusableSectionVersionRepository,
  InMemorySearchPort,
} from '@kometio/testing';
import { publishReusableSection } from './publish-reusable-section.use-case';
import { listReusableSectionsWithUsage } from './reusable-section.use-cases';
import { publishPageTranslation } from './publish-page-translation.use-case';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationVersionRepository =
    new InMemoryPageTranslationVersionRepository();
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    ),
    pageGroupVersionRepository,
    pageTranslationRepository: new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    ),
    pageTranslationVersionRepository,
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
    reusableSectionVersionRepository:
      new InMemoryReusableSectionVersionRepository(),
    searchPort: new InMemorySearchPort(),
  };
}

async function seedSection(
  deps: ReturnType<typeof setup>,
  content: PageContent,
) {
  const section = ReusableSection.create({
    id: randomUUID(),
    tenantId,
    siteId,
    name: 'Our services',
    kind: 'shared',
    content,
  });
  section.publish();
  await deps.reusableSectionRepository.add(section);
  return section;
}

/** A published page carrying one instance of `sectionId`. */
async function seedPageUsing(
  deps: ReturnType<typeof setup>,
  sectionId: string,
  overrides: Record<string, string> = {},
) {
  const group = PageGroup.create({
    id: randomUUID(),
    tenantId,
    siteId,
    createdBy: null,
  });
  group.saveContent(
    [
      {
        id: 'inst-1',
        type: 'Section',
        props: {
          section: { sectionId, sectionName: 'Our services' },
          ...overrides,
        },
      },
    ],
    { by: null },
  );
  await deps.pageGroupRepository.add(group);

  const translation = PageTranslation.create({
    id: randomUUID(),
    tenantId,
    siteId,
    pageGroupId: group.id,
    locale: 'it',
    slug: `page-${randomUUID()}`,
    seoMeta: { title: 'Page', description: '' },
    createdBy: null,
  });
  await deps.pageTranslationRepository.add(translation, null);
  await publishPageTranslation(deps, {
    tenantId,
    pageTranslationId: translation.id,
    actorUserId: null,
  });
  return translation;
}

describe('a section’s words reach the search index', () => {
  /*
   * The half of the feature that is easy to forget: search indexes a page
   * from its published snapshot, and that snapshot holds a REFERENCE where
   * the section's words are. Without resolution the page would be
   * unsearchable for every word the section contributes.
   */
  it('indexes a page by the section it shows, not by the reference', async () => {
    const deps = setup();
    const section = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Plumbing and heating' } },
    ]);
    await seedPageUsing(deps, section.id);

    const indexed = deps.searchPort.indexed.at(-1);
    expect(JSON.stringify(indexed?.content)).toContain('Plumbing and heating');
    // The snapshot itself still stores only the reference — that is what
    // lets publishing the section alone update every page using it.
    const stored = await deps.pageTranslationRepository.findById(
      tenantId,
      indexed?.translation.id ?? '',
    );
    expect(JSON.stringify(stored?.publishedSnapshot)).not.toContain(
      'Plumbing and heating',
    );
  });

  it('re-indexes every page using a section when the section is published', async () => {
    const deps = setup();
    const section = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Old words' } },
    ]);
    await seedPageUsing(deps, section.id);
    await seedPageUsing(deps, section.id);
    const before = deps.searchPort.indexed.length;

    section.saveDraft([
      { id: 'b1', type: 'Heading', props: { text: 'New words' } },
    ]);
    await deps.reusableSectionRepository.save(section);
    await publishReusableSection(deps, { tenantId, id: section.id });

    const after = deps.searchPort.indexed.slice(before);
    expect(after).toHaveLength(2);
    for (const entry of after) {
      expect(JSON.stringify(entry.content)).toContain('New words');
    }
  });

  it('leaves pages that do not use the section alone', async () => {
    const deps = setup();
    const used = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Used' } },
    ]);
    const unused = await seedSection(deps, [
      { id: 'b2', type: 'Heading', props: { text: 'Unused' } },
    ]);
    await seedPageUsing(deps, used.id);
    const before = deps.searchPort.indexed.length;

    await publishReusableSection(deps, { tenantId, id: unused.id });

    expect(deps.searchPort.indexed).toHaveLength(before);
  });

  it('indexes the instance’s own overridden value, not the section’s', async () => {
    const deps = setup();
    const section = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Our services' } },
    ]);
    await seedPageUsing(deps, section.id, {
      [sectionOverrideKey('b1', 'text')]: 'What we do',
    });

    const indexed = deps.searchPort.indexed.at(-1);
    expect(JSON.stringify(indexed?.content)).toContain('What we do');
  });
});

describe('how many pages place a section', () => {
  it('counts each page once, and never counts a template', async () => {
    const deps = setup();
    const shared = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Shared' } },
    ]);
    const template = ReusableSection.create({
      id: randomUUID(),
      tenantId,
      siteId,
      name: 'A template',
      kind: 'template',
      content: [{ id: 'b2', type: 'Heading', props: { text: 'Template' } }],
    });
    template.publish();
    await deps.reusableSectionRepository.add(template);
    await seedPageUsing(deps, shared.id);
    await seedPageUsing(deps, shared.id);

    const listed = await listReusableSectionsWithUsage(deps, tenantId, siteId);
    const bySection = new Map(
      listed.map((row) => [row.section.id, row.usedOnPages]),
    );
    expect(bySection.get(shared.id)).toBe(2);
    // Nothing points back at a template — a number here would suggest a
    // link that does not exist.
    expect(bySection.get(template.id)).toBe(0);
  });

  /*
   * The newsletter in the template: deleting it takes a strip out of every
   * page made from the template afterwards, so the list has to say it is
   * there, not only on which pages it already stands.
   */
  it('counts the templates that hold a section, draft or published, once each', async () => {
    const deps = setup();
    const newsletter = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Newsletter' } },
    ]);
    const instance = (id: string) => ({
      id,
      type: 'Section',
      props: {
        section: { sectionId: newsletter.id, sectionName: 'Newsletter' },
      },
    });
    const published = ReusableSection.create({
      id: randomUUID(),
      tenantId,
      siteId,
      name: 'Service page',
      kind: 'template',
      content: [instance('i1'), instance('i2')],
    });
    published.publish();
    const draftOnly = ReusableSection.create({
      id: randomUUID(),
      tenantId,
      siteId,
      name: 'Article',
      kind: 'template',
      content: [instance('i3')],
    });
    await deps.reusableSectionRepository.add(published);
    await deps.reusableSectionRepository.add(draftOnly);
    await seedPageUsing(deps, newsletter.id);

    const listed = await listReusableSectionsWithUsage(deps, tenantId, siteId);
    const row = listed.find((one) => one.section.id === newsletter.id);
    expect(row?.usedOnPages).toBe(1);
    expect(row?.usedInTemplates).toBe(2);
    expect(
      listed.find((one) => one.section.id === published.id)?.usedInTemplates,
    ).toBe(0);
  });

  it('counts a page whose draft holds it but which was never published', async () => {
    const deps = setup();
    const section = await seedSection(deps, [
      { id: 'b1', type: 'Heading', props: { text: 'Draft only' } },
    ]);
    const group = PageGroup.create({
      id: randomUUID(),
      tenantId,
      siteId,
      createdBy: null,
    });
    group.saveContent(
      [
        {
          id: 'inst-x',
          type: 'Section',
          props: { section: { sectionId: section.id, sectionName: 'x' } },
        },
      ],
      { by: null },
    );
    await deps.pageGroupRepository.add(group);

    const listed = await listReusableSectionsWithUsage(deps, tenantId, siteId);
    // What an author wants before renaming or deleting is where it is
    // PLACED, which includes a page nobody has published yet.
    expect(listed[0]?.usedOnPages).toBe(1);
  });
});
