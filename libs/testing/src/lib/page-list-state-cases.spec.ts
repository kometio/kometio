import { describe, expect, it } from 'vitest';
import { hasUnpublishedChanges } from '@kometio/domain-core';
import { pageListStateOf, shownTranslation } from '@kometio/shared-types';
import {
  PAGE_LIST_STATE_CASES,
  buildPageForListStateCase,
} from './page-list-state-cases.test-fixture';

/*
 * The TypeScript half of the rule, held to the table. The SQL half is held to
 * it by the page repository's integration spec, and the in-memory repository
 * by its own: three implementations, one set of answers.
 */
describe('the page list state cases, against the functions that decide them', () => {
  it('has a case for each of the three states, and for a page with no language', () => {
    const states = new Set(PAGE_LIST_STATE_CASES.map((c) => c.expected.state));

    expect(states).toEqual(new Set(['draft', 'published', 'pending', null]));
  });

  it.each(PAGE_LIST_STATE_CASES.map((c) => [c.name, c] as const))(
    '%s',
    (_name, listCase) => {
      const { group, translations } = buildPageForListStateCase(listCase, {
        id: 'page',
      });

      const shown = shownTranslation(translations, listCase.defaultLocale);

      expect(shown?.locale ?? null).toBe(listCase.expected.shown);
      expect(
        shown
          ? pageListStateOf({
              status: shown.status,
              hasUnpublishedChanges: hasUnpublishedChanges({
                status: shown.status,
                isDiverged: shown.isDiverged,
                contentUpdatedAt: shown.contentUpdatedAt,
                publishedAt: shown.publishedAt,
                groupContentUpdatedAt: group.contentUpdatedAt,
              }),
            })
          : null,
      ).toBe(listCase.expected.state);
    },
  );
});
