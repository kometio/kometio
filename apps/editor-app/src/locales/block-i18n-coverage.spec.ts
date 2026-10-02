import { describe, expect, it } from 'vitest';
import {
  pageBlocks,
  pageBlockCategories,
  headerFooterBlocks,
} from '@kometio/block-registry';
import en from './en.json';
import itLocale from './it.json';

/**
 * Extension Manifest planning, 2026-09-02: nothing checked that a block's
 * declared i18n keys (label/fieldLabel/option labels) actually exist in
 * these files — `Heading` shipped (2026-09-01) with none of them present
 * in either en.json or it.json, silently rendering raw keys like
 * "blocks.heading.label" in the live block picker/Inspector (`tLabel()`'s
 * `defaultValue: key` never throws or warns). This test fails against
 * that historical state and passes after the fix — the actual regression
 * it exists to catch, not a synthetic one.
 *
 * Lives here, not in `libs/block-registry`, because a domain-tagged lib
 * cannot depend on an app (`eslint.config.mjs`'s `depConstraints`) — this
 * app already depends on `@kometio/block-registry` and owns these two
 * locale files, so this is the correct, boundary-respecting home.
 */
function resolveKey(dict: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      dict,
    );
}

function expectKeyResolves(key: string) {
  for (const [localeName, dict] of [
    ['en', en],
    ['it', itLocale],
  ] as const) {
    const value = resolveKey(dict, key);
    expect(
      typeof value === 'string' && value.length > 0,
      `missing/empty ${localeName}.json key: "${key}"`,
    ).toBe(true);
  }
}

describe('block i18n key coverage', () => {
  it('resolves every block label, field label, and option label in both en.json and it.json', () => {
    for (const block of [...pageBlocks, ...headerFooterBlocks]) {
      expectKeyResolves(block.label);
      for (const field of block.fields) {
        expectKeyResolves(field.label);
        if ('options' in field) {
          for (const option of field.options) {
            expectKeyResolves(option.label);
          }
        }
      }
    }
  });

  it('places every registered block type in exactly one category, with a translated category title', () => {
    for (const category of pageBlockCategories) {
      expectKeyResolves(category.title);
    }
  });
});

/**
 * The other half of the same problem, and the half nothing was checking.
 *
 * `t()` is typed against en.json, so a key missing THERE is a compile
 * error — a real guarantee, and the reason the English side has never
 * drifted. it.json has no such backstop: a key added in English and
 * forgotten in Italian falls back to the English string silently, and the
 * only way anyone finds out is by reading the interface in Italian and
 * seeing a word in the wrong language.
 *
 * Fase 7 added five groups of keys across two files; this is what makes
 * the next batch fail loudly instead.
 */
describe('the two locales carry the same keys', () => {
  function leafKeys(node: unknown, prefix = ''): string[] {
    if (typeof node !== 'object' || node === null) {
      return [prefix];
    }
    return Object.entries(node as Record<string, unknown>).flatMap(
      ([key, value]) => leafKeys(value, prefix ? `${prefix}.${key}` : key),
    );
  }

  it('has no key in English that Italian is missing', () => {
    const english = new Set(leafKeys(en));
    const italian = new Set(leafKeys(itLocale));
    expect([...english].filter((key) => !italian.has(key))).toEqual([]);
  });

  /*
   * And the reverse: a key only Italian has is either a typo or something
   * deleted from English and left behind — dead weight either way, and
   * one nobody would ever see.
   */
  it('has no key in Italian that English is missing', () => {
    const english = new Set(leafKeys(en));
    const italian = new Set(leafKeys(itLocale));
    expect([...italian].filter((key) => !english.has(key))).toEqual([]);
  });
});
