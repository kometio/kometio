import type { PageGroup, PageTranslation } from '@kometio/domain-core';
import type { PageListState } from '@kometio/shared-types';
import { buildPageGroup, buildPageTranslation } from './entities.test-fixture';

/*
 * What state a page's row is in, and which language it shows, written once.
 *
 * The rule exists in more than one language of code: `hasUnpublishedChanges`
 * (domain-core) and `shownTranslation` (shared-types) in TypeScript, and
 * `statusCondition` in SQL in the page repository, which has to answer the
 * same for a list that is filtered and paginated by the database. They cannot
 * share a line, so they share these cases: the specs of each implementation
 * build the page a case describes, ask their implementation, and compare with
 * `expected`. A change to the rule is a change to this table, and the one that
 * was not made to the implementation fails.
 */

export const LIST_STATE_CREATED_AT = new Date('2026-01-01T00:00:00Z');
export const LIST_STATE_PUBLISHED_AT = new Date('2026-04-01T00:00:00Z');
export const LIST_STATE_CHANGED_AT = new Date('2026-06-01T00:00:00Z');

export interface PageListStateCase {
  name: string;
  /** The site's default language, the one a row shows when the page has it. */
  defaultLocale: string;
  /** The shared structure changed after the publications. */
  sharedChanged?: boolean;
  translations: {
    locale: string;
    published?: boolean;
    /** Its own structure: what changes in the shared one is not its. */
    diverged?: boolean;
    /** Its own content changed after its publication. */
    ownChanged?: boolean;
  }[];
  expected: {
    /** The language the row shows, or none for a page with no language. */
    shown: string | null;
    /** Its state, or none: a page with no language is in no state, not even draft. */
    state: PageListState | null;
  };
}

export const PAGE_LIST_STATE_CASES: readonly PageListStateCase[] = [
  {
    name: 'a page that was never published is a draft',
    defaultLocale: 'it',
    translations: [{ locale: 'it' }],
    expected: { shown: 'it', state: 'draft' },
  },
  {
    name: 'a published page nothing has changed since is published',
    defaultLocale: 'it',
    translations: [{ locale: 'it', published: true }],
    expected: { shown: 'it', state: 'published' },
  },
  {
    name: 'its own content changed after the publication: pending',
    defaultLocale: 'it',
    translations: [{ locale: 'it', published: true, ownChanged: true }],
    expected: { shown: 'it', state: 'pending' },
  },
  {
    name: 'the shared structure changed after the publication: pending',
    defaultLocale: 'it',
    sharedChanged: true,
    translations: [{ locale: 'it', published: true }],
    expected: { shown: 'it', state: 'pending' },
  },
  {
    name: 'the shared structure changed, but this language has its own: not pending',
    defaultLocale: 'it',
    sharedChanged: true,
    translations: [{ locale: 'it', published: true, diverged: true }],
    expected: { shown: 'it', state: 'published' },
  },
  {
    name: 'its own structure changed after the publication: pending',
    defaultLocale: 'it',
    sharedChanged: true,
    translations: [
      { locale: 'it', published: true, diverged: true, ownChanged: true },
    ],
    expected: { shown: 'it', state: 'pending' },
  },
  {
    name: 'the default language is the one shown, whatever the others are',
    defaultLocale: 'it',
    translations: [{ locale: 'it', published: true }, { locale: 'en' }],
    expected: { shown: 'it', state: 'published' },
  },
  {
    name: 'a default language that is a draft makes the page a draft, though another is published',
    defaultLocale: 'en',
    translations: [{ locale: 'it', published: true }, { locale: 'en' }],
    expected: { shown: 'en', state: 'draft' },
  },
  {
    name: 'without the default language the first by code is shown',
    defaultLocale: 'it',
    translations: [{ locale: 'en' }, { locale: 'de', published: true }],
    expected: { shown: 'de', state: 'published' },
  },
  {
    name: 'a page with no language is in no state',
    defaultLocale: 'it',
    translations: [],
    expected: { shown: null, state: null },
  },
];

/** The page a case describes, as entities: what a spec persists, or asks its implementation about. */
export function buildPageForListStateCase(
  listCase: PageListStateCase,
  options: {
    id: string;
    tenantId?: string;
    siteId?: string;
    /** The title of each of its languages, so that a spec can find the page by it. */
    title?: string;
    /** The id of each of its languages; the repository that stores them may want real uuids. */
    translationId?: (locale: string) => string;
    /** Where it sits and who made it, for a spec that filters by those too. */
    group?: {
      parentId?: string | null;
      createdBy?: string | null;
      collectionId?: string | null;
    };
  },
): { group: PageGroup; translations: PageTranslation[] } {
  const { id, tenantId = 'tenant-1', siteId = 'site-1', title = id } = options;
  const group = buildPageGroup({
    ...options.group,
    id,
    tenantId,
    siteId,
    now: LIST_STATE_CREATED_AT,
  });
  const translations = listCase.translations.map((language) => {
    // Created before it is published, as it is in life: a translation made
    // after its own publication would read as having changes waiting.
    const translation = buildPageTranslation({
      id:
        options.translationId?.(language.locale) ?? `${id}-${language.locale}`,
      tenantId,
      siteId,
      pageGroupId: id,
      locale: language.locale,
      slug: `${id}-${language.locale}`,
      seoMeta: { title, description: '' },
      now: LIST_STATE_CREATED_AT,
    });
    if (language.diverged) {
      translation.diverge([], { by: null, now: LIST_STATE_CREATED_AT });
    }
    if (language.published) {
      translation.publish([], { by: null, now: LIST_STATE_PUBLISHED_AT });
    }
    if (language.ownChanged) {
      const edit = { by: null, now: LIST_STATE_CHANGED_AT };
      if (language.diverged) translation.saveDivergedContent([], edit);
      else translation.saveFieldValues({}, edit);
    }
    return translation;
  });
  if (listCase.sharedChanged) {
    group.saveContent([{ id: `b-${id}`, type: 'Text', props: { body: id } }], {
      by: null,
      now: LIST_STATE_CHANGED_AT,
    });
  }
  return { group, translations };
}
