/**
 * Prints every block the editor offers, as JSON — the factual half of
 * the documentation's block reference.
 *
 *   npx tsx tools/dump-block-inventory.mts > /tmp/blocks.json
 *
 * Run it before touching those pages. A block reference written from
 * memory is wrong the day somebody adds a block, and the failure is
 * invisible: nothing breaks, the docs just quietly stop listing one.
 * What a page still has to add by hand is the part no registry knows —
 * what each block is FOR, and when to reach for it.
 *
 * Labels come out in both languages, exactly as the editor shows them
 * (`apps/editor-app/src/locales/*.json`), because a documentation page
 * that renames a button is worse than one that omits it.
 */
// By path, not by package name: `tools/` is deliberately outside the
// pnpm workspace (it holds repo-wide checks that must run before any
// install-dependent target), so `@kometio/*` does not resolve from here.
import {
  pageBlocks,
  pageBlockCategories,
  headerFooterBlocks,
} from '../libs/block-registry/src/index';
import { readFileSync } from 'node:fs';

type Dict = Record<string, unknown>;

const en = JSON.parse(
  readFileSync('apps/editor-app/src/locales/en.json', 'utf8'),
) as Dict;
const it = JSON.parse(
  readFileSync('apps/editor-app/src/locales/it.json', 'utf8'),
) as Dict;

/** An i18n key is a dotted path; a label that resolves to nothing is reported as null rather than as the key itself. */
function label(dict: Dict, key: string): string | null {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Dict)[part] : undefined,
      dict,
    );
  return typeof value === 'string' ? value : null;
}

const all = [...pageBlocks, ...headerFooterBlocks];
const byType = new Map(all.map((block) => [block.type, block]));

const categories = pageBlockCategories.map((category) => ({
  titleEn: label(en, category.title),
  titleIt: label(it, category.title),
  blocks: category.types.map((type) => {
    const block = byType.get(type);
    if (!block) {
      // A category naming a type no registry has is a bug in the
      // picker's config, not in this script — say so loudly.
      return { type, MISSING_FROM_REGISTRY: true };
    }
    return {
      type,
      labelEn: label(en, block.label),
      labelIt: label(it, block.label),
      isContainer: Boolean(block.isContainer),
      allowedChildTypes: block.allowedChildTypes ?? null,
      variants: (block.variants ?? []).map((variant) => ({
        value: variant.value,
        en: label(en, variant.label),
        it: label(it, variant.label),
      })),
      stylableProperties: (block.stylableProperties ?? []).length,
      fields: block.fields.map((field) => ({
        key: field.key,
        kind: field.kind,
        en: label(en, field.label),
        it: label(it, field.label),
        group: field.group ?? 'content',
        required: Boolean(field.required),
      })),
    };
  }),
}));

const inPicker = new Set(pageBlockCategories.flatMap((c) => c.types));

console.log(
  JSON.stringify(
    {
      counts: { insertable: inPicker.size },
      categories,
      // Real blocks that are not in the picker: they belong to the
      // header and footer, and a reference that lists them among the
      // page blocks sends somebody looking for them in the wrong menu.
      headerFooterOnly: all
        .filter((block) => !inPicker.has(block.type))
        .map((block) => ({
          type: block.type,
          labelEn: label(en, block.label),
          labelIt: label(it, block.label),
        })),
    },
    null,
    2,
  ),
);
