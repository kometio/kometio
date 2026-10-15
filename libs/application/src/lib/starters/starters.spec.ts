import { describe, expect, it } from 'vitest';
import {
  auditBlockProps,
  STARTER_LANGUAGES,
  type PageContent,
  type StarterLanguage,
} from '@kometio/shared-types';
import {
  emptyStarterIds,
  resolveStarterContent,
  type StarterIds,
} from './resolve-starter-content';
import type { StarterContent } from './starter';
import { STARTERS, starterLanguageFor } from './starters';

const SITE_NAME = 'Casa Azzurra';

/** Every key a starter makes gets an id, so that every reference it holds can be resolved. */
function idsFor(content: StarterContent): StarterIds {
  const ids = emptyStarterIds();
  for (const page of content.pages) ids.page.set(page.key, `page-${page.key}`);
  for (const form of content.forms) ids.form.set(form.key, `form-${form.key}`);
  for (const taxonomy of content.taxonomies) {
    ids.taxonomy.set(taxonomy.key, `taxonomy-${taxonomy.key}`);
    for (const term of taxonomy.terms) {
      ids.term.set(term.key, `term-${term.key}`);
    }
  }
  return ids;
}

/** The kinds of block in a tree, in order, with their children: the shape of a page, none of its words. */
function shapeOf(blocks: PageContent): unknown[] {
  return blocks.map((block) => [block.type, shapeOf(block.children ?? [])]);
}

function contentOf(
  starter: (typeof STARTERS)[number],
  language: StarterLanguage,
): StarterContent {
  return starter.content[language]({ siteName: SITE_NAME });
}

describe.each(STARTERS.map((starter) => [starter.id, starter] as const))(
  'the %s starter',
  (_id, starter) => {
    describe.each(STARTER_LANGUAGES)('in %s', (language) => {
      const content = contentOf(starter, language);
      const ids = idsFor(content);
      const everyBlock: [string, PageContent][] = [
        ['header', content.header],
        ['footer', content.footer],
        ...content.pages.map((page): [string, PageContent] => [
          `page "${page.key}"`,
          page.content,
        ]),
      ];

      it.each(everyBlock)(
        'has %s resolving and holding to the schema of every block in it',
        (_where, blocks) => {
          // Resolving parses each block with its own schema, so a block a
          // starter got wrong throws here and not in front of a visitor.
          const resolved = resolveStarterContent(blocks, ids);
          const audit = auditBlockProps(resolved);

          expect(audit.invalid).toEqual([]);
          // Every block is of a type the core knows: nothing slipped past unchecked.
          expect([...audit.unchecked.keys()]).toEqual([]);
        },
      );

      it('leaves no reference unresolved', () => {
        for (const [, blocks] of everyBlock) {
          const text = JSON.stringify(resolveStarterContent(blocks, ids));
          expect(text).not.toContain('starter:');
        }
      });

      it('starts with the home page, at the address the site opens at', () => {
        const [first] = content.pages;

        expect(first?.key).toBe('home');
        expect(first?.slug).toBe('home');
        expect(first?.parent).toBeUndefined();
      });

      it('makes every page after the one it sits under, and none twice', () => {
        const seen = new Set<string>();
        for (const page of content.pages) {
          expect(seen.has(page.key), `${page.key} twice`).toBe(false);
          if (page.parent) {
            expect(seen.has(page.parent), `${page.key} before its parent`).toBe(
              true,
            );
          }
          seen.add(page.key);
        }
      });

      it('gives sibling pages different addresses', () => {
        const addresses = content.pages.map(
          (page) => `${page.parent ?? ''}/${page.slug}`,
        );

        expect(new Set(addresses).size).toBe(addresses.length);
      });

      it('names only collections and terms it makes', () => {
        const collections = new Set(content.collections.map((c) => c.key));
        const terms = new Set(
          content.taxonomies.flatMap((t) => t.terms.map((term) => term.key)),
        );
        for (const page of content.pages) {
          if (page.collection) {
            expect(collections.has(page.collection)).toBe(true);
          }
          for (const term of page.terms ?? []) {
            expect(terms.has(term)).toBe(true);
          }
        }
      });

      it('writes every page a title and a description a search result can use', () => {
        for (const page of content.pages) {
          expect(page.title.trim(), page.key).not.toBe('');
          expect(page.description.trim(), page.key).not.toBe('');
          expect(page.description.length, page.key).toBeLessThanOrEqual(160);
        }
      });

      it('writes every form at least one required field and an email to answer to', () => {
        for (const form of content.forms) {
          expect(form.fields.some((field) => field.type === 'email')).toBe(
            true,
          );
          expect(form.fields.some((field) => field.required)).toBe(true);
        }
      });
    });

    it('is the same site in every language: the same pages, forms, sections and blocks', () => {
      const [first, ...others] = STARTER_LANGUAGES.map((language) =>
        contentOf(starter, language),
      );
      if (!first) throw new Error('A starter has no language');
      const describeSite = (content: StarterContent) => ({
        pages: content.pages.map((page) => ({
          key: page.key,
          parent: page.parent,
          collection: page.collection,
          terms: page.terms,
          shape: shapeOf(page.content),
        })),
        forms: content.forms.map((form) => form.key),
        collections: content.collections.map((collection) => collection.key),
        taxonomies: content.taxonomies.map((taxonomy) => ({
          key: taxonomy.key,
          terms: taxonomy.terms.map((term) => term.key),
        })),
        header: shapeOf(first.header),
        footer: shapeOf(first.footer),
      });

      for (const other of others) {
        expect(describeSite(other)).toEqual(describeSite(first));
      }
    });

    it('is written afresh in every language, not copied', () => {
      const [first, second] = STARTER_LANGUAGES.map((language) =>
        JSON.stringify(contentOf(starter, language).pages),
      );

      expect(first).not.toBe(second);
    });
  },
);

describe('the language a starter is written in for a site', () => {
  it.each([
    ['it', 'it', false],
    ['it-IT', 'it', false],
    ['it-CH', 'it', false],
    ['en', 'en', false],
    ['en-GB', 'en', false],
    ['en-US', 'en', false],
    ['fr-FR', 'en', true],
    ['de-DE', 'en', true],
    ['pt-BR', 'en', true],
  ])('%s is %s (a fallback: %s)', (locale, language, fallback) => {
    expect(starterLanguageFor(locale)).toEqual({ language, fallback });
  });
});
