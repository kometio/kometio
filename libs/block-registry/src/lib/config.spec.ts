import { describe, expect, it } from 'vitest';
import {
  BLOCK_STYLE_DEFAULTS,
  BLOCKS_WITHOUT_SEARCHABLE_TEXT,
  COMMERCE_BLOCK_TYPES,
  SEARCHABLE_BLOCK_TYPES,
} from '@kometio/shared-types';
import type { BlockDescriptor } from './field-types';
import { pageBlockCategories, pageBlocks } from './config';
import { headerFooterBlocks } from './layout-config';

describe('pageBlocks', () => {
  // Security review 2026-08-24: not a literal count — that broke for the
  // wrong reason (a legitimate new block) every time one was added/removed.
  // What actually matters is that every registered type is unique.
  it('registers page blocks, each with a unique type', () => {
    expect(pageBlocks.length).toBeGreaterThan(0);
    const types = pageBlocks.map((block) => block.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every block a label, category, defaultProps and fields array', () => {
    for (const block of pageBlocks) {
      expect(block.label.length).toBeGreaterThan(0);
      expect(block.category.length).toBeGreaterThan(0);
      expect(block.defaultProps).toBeTypeOf('object');
      expect(Array.isArray(block.fields)).toBe(true);
    }
  });

  it('never lets a `render` function slip back in (data only, per the plan)', () => {
    for (const block of pageBlocks) {
      expect('render' in block).toBe(false);
    }
  });
});

describe('pageBlockCategories', () => {
  it('places every registered block type in exactly one category, with no leftovers', () => {
    const registeredTypes = pageBlocks.map((block) => block.type).sort();
    const categorizedTypes = pageBlockCategories
      .flatMap((category) => category.types)
      .sort();

    expect(categorizedTypes).toEqual(registeredTypes);
  });

  it('never lists the same type in two categories', () => {
    const allTypes = pageBlockCategories.flatMap((category) => category.types);
    expect(new Set(allTypes).size).toBe(allTypes.length);
  });
});

// Field-level i18n (a shared structure plus per-locale overrides):
// `translatable` is explicitly opt-in, never inferred from
// `kind`/`inlineEditable` (Image.alt is translatable but not inlineEditable
// — no automatic heuristic is reliable). A spot check on the audit's less
// obvious decisions, not exhaustive: the rest is self-documented in the
// individual *.block.ts files.
describe('translatable field audit spot-checks', () => {
  function fieldOf(type: string, key: string) {
    const block = pageBlocks.find((b) => b.type === type);
    if (!block) throw new Error(`Test fixture is missing block type "${type}"`);
    const field = block.fields.find(
      (f): f is Extract<typeof f, { key: string }> => f.key === key,
    );
    if (!field)
      throw new Error(`Test fixture is missing field "${key}" on "${type}"`);
    return field;
  }

  /** `undefined` for a kind of field that has no say in it. */
  function translatableOf(type: string, key: string): boolean | undefined {
    const field = fieldOf(type, key);
    return 'translatable' in field ? field.translatable : undefined;
  }

  it('marks ordinary text content as translatable', () => {
    expect(translatableOf('Hero', 'title')).toBe(true);
    expect(translatableOf('Text', 'body')).toBe(true);
    expect(translatableOf('Image', 'alt')).toBe(true);
  });

  it("leaves a person's proper name untranslated (shared across locales)", () => {
    expect(translatableOf('Testimonial', 'author')).not.toBe(true);
    expect(translatableOf('TeamMember', 'name')).not.toBe(true);
  });

  it('leaves structural/data fields (video/date) untranslated', () => {
    expect(translatableOf('VideoEmbed', 'url')).not.toBe(true);
    expect(translatableOf('Countdown', 'targetDate')).not.toBe(true);
  });

  // Found live during the i18n backfill against real docs-showcase content
  // (not just theorized): a real site used ctaLinkFields()'s `url` for a
  // hand-typed internal path ("/it/docs"), not just a true external link —
  // marked translatable after the fact, this locks the correction in.
  it("marks ctaLinkFields()'s shared `url` field as translatable — internal relative paths must vary by locale", () => {
    expect(translatableOf('Button', 'url')).toBe(true);
    expect(translatableOf('Banner', 'url')).toBe(true);
  });

  // Found live during round-trip verification of the i18n backfill (not
  // just theorized): real Code blocks embed human-language comments in the
  // snippet (e.g. "# overrides Hero") that were hand-translated per locale
  // under the old duplicated-page model — locks the correction in.
  it('marks Code.code as translatable — snippets can embed human-language comments', () => {
    expect(translatableOf('Code', 'code')).toBe(true);
  });
});

// Security review 2026-08-24, point 16: nothing checked that a block's
// `stylableProperties` matched the keys in its `BLOCK_STYLE_DEFAULTS` — a
// mismatch (a block declaring `backgroundColor` with no default for it,
// say) went unnoticed. A first-party descriptor now takes both from its
// contract (`coreBlock`, ADR-0116), so they agree by construction; what is
// left to hold is the ones that say their own list (Anchor, Section): a
// property the editor offers has to have a default to show. Header/footer
// and page blocks together (Text, Image and SearchBox are shared by both,
// deduplicated by type).
describe('stylableProperties / BLOCK_STYLE_DEFAULTS alignment', () => {
  const allBlocksByType = new Map(
    [...pageBlocks, ...headerFooterBlocks].map((block) => [block.type, block]),
  );

  it('gives every property a block offers a default in BLOCK_STYLE_DEFAULTS', () => {
    for (const block of allBlocksByType.values()) {
      const defaults = BLOCK_STYLE_DEFAULTS[block.type] ?? {};
      const withoutDefault = (block.stylableProperties ?? []).filter(
        (property) => !Object.hasOwn(defaults, property),
      );

      expect(
        withoutDefault,
        `${block.type} offers properties that have no default in BLOCK_STYLE_DEFAULTS`,
      ).toEqual([]);
    }
  });

  it('hands a block the defaults of its contract, not a copy that can drift', () => {
    for (const block of allBlocksByType.values()) {
      expect(block.defaultStyle, block.type).toBe(
        BLOCK_STYLE_DEFAULTS[block.type],
      );
    }
  });
});

// Same session: search-text.ts used to be a plain `switch` with a silent
// `default: return []` — a new block with real prose (again, Heading)
// could ship invisible to on-site search with nothing failing. Now every
// contract declares what search reads of its block or why it reads nothing
// (ADR-0115), and the two lists that come out — `SEARCHABLE_BLOCK_TYPES`
// and `BLOCKS_WITHOUT_SEARCHABLE_TEXT` — must together account for every
// block type the registry offers, with no leftovers either way: a type no
// contract declares fails loudly instead of silently indexing nothing.
describe('search-text.ts prose-field coverage', () => {
  it('accounts for every registered block type as either searchable or explicitly excluded', () => {
    const allTypes = new Set([
      ...pageBlocks.map((block) => block.type),
      ...headerFooterBlocks.map((block) => block.type),
    ]);
    const accountedFor = new Set([
      ...SEARCHABLE_BLOCK_TYPES,
      ...BLOCKS_WITHOUT_SEARCHABLE_TEXT,
    ]);

    for (const type of allTypes) {
      expect(
        accountedFor.has(type),
        `"${type}" is neither in SEARCHABLE_BLOCK_TYPES nor BLOCKS_WITHOUT_SEARCHABLE_TEXT`,
      ).toBe(true);
    }
  });

  it('never double-counts a type as both searchable and explicitly excluded', () => {
    const excluded = new Set<string>(BLOCKS_WITHOUT_SEARCHABLE_TEXT);
    const overlap = SEARCHABLE_BLOCK_TYPES.filter((type) => excluded.has(type));
    expect(overlap).toEqual([]);
  });
});

describe('every block a file defines is a block somebody can insert', () => {
  /*
   * The gap this closes, found only because the user asked whether the
   * new blocks were actually there: eight blocks were written, registered
   * as exports, rendered by BlockRenderer, covered by tests — and absent
   * from `pageBlocks`, which is the list the editor's picker is built
   * from. They compiled, they passed, and nobody could insert one.
   *
   * Every other invariant in this file starts FROM `pageBlocks`, so none
   * of them could see a block that never got in. This one starts from the
   * files on disk instead.
   */
  // The descriptors the block files export, read from the modules and not
  // from their text: a block's `type` is its contract's now (`coreBlock`),
  // so there is no literal in the file to scrape.
  const definedBlocks = Object.entries(
    import.meta.glob<Record<string, unknown>>('./blocks/*.block.ts', {
      eager: true,
    }),
  ).map(([file, module]) => ({
    file,
    descriptors: Object.values(module).filter(isBlockDescriptor),
  }));

  it('finds exactly one descriptor in every block file, so the check below cannot go vacuous', () => {
    const wrong = definedBlocks.filter(
      (block) => block.descriptors.length !== 1,
    );
    expect(wrong.map((block) => block.file)).toEqual([]);
    expect(definedBlocks.length).toBeGreaterThan(50);
  });

  it.each(definedBlocks.map((block) => [block.file, block.descriptors[0]]))(
    '%s is listed in pageBlocks or headerFooterBlocks',
    (file, descriptor) => {
      const listed = [...pageBlocks, ...headerFooterBlocks].includes(
        descriptor,
      );
      expect(
        listed,
        `${file} defines "${descriptor?.type}" but no list offers it — the editor cannot insert it`,
      ).toBe(true);
    },
  );
});

function isBlockDescriptor(value: unknown): value is BlockDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'fields' in value &&
    Array.isArray(value.fields)
  );
}

/**
 * The guard for `COMMERCE_BLOCK_TYPES` (ADR-0084), which is a list of
 * types the picker is told not to offer — and a list of names is exactly
 * the kind of thing that goes quietly wrong: rename a block, or misspell
 * one here, and the list still type-checks while the block it was meant
 * to hide is back on the shelf.
 */
describe('COMMERCE_BLOCK_TYPES', () => {
  it('names only types this registry actually has', () => {
    const registered = new Set(pageBlocks.map((block) => block.type));
    const unknown = COMMERCE_BLOCK_TYPES.filter(
      (type) => !registered.has(type),
    );

    expect(
      unknown,
      'block-sdk/src/lib/commerce-block-types.ts names types this registry does not register — a rename or a typo, and the block it should hide is being offered',
    ).toEqual([]);
  });

  /**
   * The picker is not the only way a block gets inserted: a "collection"
   * container adds a child of its single `allowedChildTypes` with no
   * picker at all. Hiding a parent closes that door only while both ends
   * are hidden — `ProductGrid`→`ProductCard` and
   * `ProductReviews`→`ProductReview` are, today. Giving a block that IS
   * offered a hidden child would quietly reopen it, and nothing else in
   * the workspace would notice.
   */
  it('is never reachable as the child of a block that is still offered', () => {
    const hidden = new Set(COMMERCE_BLOCK_TYPES);
    const doors = [...pageBlocks, ...headerFooterBlocks]
      .filter((block) => !hidden.has(block.type))
      .flatMap((block) =>
        (block.allowedChildTypes ?? [])
          .filter((child) => hidden.has(child))
          .map((child) => `${block.type} -> ${child}`),
      );

    expect(
      doors,
      'a block the picker still offers accepts a hidden commerce block as a child, so it can be inserted anyway',
    ).toEqual([]);
  });
});
