import { z } from 'zod';
import { customFieldControlSchema } from './custom-field-control';
import {
  blockStyleDefaultsSchema,
  blockStyleOverrideSchema,
  blockTypeNameSchema,
  blockVariantNameSchema,
  themeStylePropertyKeySchema,
} from './site-theme-tokens';

/**
 * The wire contract for `GET /api/themes/current/blocks` (docs/adr/0041)
 * — a theme's own extra block types, discovered from `themes/<name>/
 * blocks/*.block.ts` at build time and served to editor-app so it can
 * merge them into its block picker/Inspector. Deliberately a hand-written
 * schema independent of `@kometio/block-sdk`'s `BlockDescriptor`/
 * `FieldDescriptor` TS types, not derived from them — the same accepted
 * trade-off `BLOCK_STYLE_DEFAULTS`/icon manifest responses already make
 * (see resolve-theme-block-style-defaults.ts, resolve-theme-icons.ts):
 * apps/public-site and apps/editor-app get a small, independently
 * versionable wire shape instead of a new dependency edge onto
 * `@kometio/block-sdk`.
 *
 * `kind: 'custom'` used to be absent here, because it carried a live
 * React `ComponentType` and so could not cross an HTTP/JSON boundary. A
 * descriptor now names its control instead of holding it, so it can, and
 * a theme may declare one — see `customFieldControlSchema` for the set of
 * names, and `validateThemeBlockSet()` for the check that a theme has not
 * invented one the editor cannot draw.
 */
/**
 * The two things every field carries, whatever draws it. Written once
 * and spread into each member below: `key`/`label` were repeated seven
 * times, and adding `showWhen`/`group` (ADR-0062) would have made that
 * eleven copies of the same four lines.
 */
const themeFieldCommonShape = {
  key: z.string(),
  label: z.string(),
  /**
   * When the field is worth showing — one comparison against a sibling
   * prop, see `FieldCondition` in @kometio/block-sdk. A theme gets it too:
   * conditional fields are part of the authoring vocabulary, and a
   * vocabulary core alone can speak is the thing ADR-0048 refuses.
   */
  showWhen: z
    .object({
      field: z.string(),
      equals: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number(), z.boolean()])),
      ]),
    })
    .optional(),
  /** Which part of the inspector it belongs to — absent means `content`. */
  group: z.enum(['content', 'style', 'advanced']).optional(),
  /** A soft nudge while the field is empty, on any kind since ADR-0063 — never a save blocker. */
  required: z.boolean().optional(),
};

/** What the three free-text kinds add on top — also written once, for the same reason. */
const themeTextualFieldShape = {
  ...themeFieldCommonShape,
  inlineEditable: z.boolean().optional(),
  placeholder: z.string().optional(),
  requiredUnless: z.string().optional(),
  fallbackFrom: z.string().optional(),
  translatable: z.boolean().optional(),
};

export const themeFieldDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), ...themeTextualFieldShape }),
  z.object({ kind: z.literal('textarea'), ...themeTextualFieldShape }),
  // A theme must be able to declare one too, or rich text would be a
  // privilege of core blocks (ADR-0046, and the additive rule of
  // ADR-0048). Same shape as `textarea`; what differs is that the value
  // is sanitised HTML rather than a literal string.
  z.object({ kind: z.literal('richtext'), ...themeTextualFieldShape }),
  // Opened 2026-09-07. It used to be excluded with the note that a
  // `custom` field "carries a live React ComponentType, which cannot
  // cross an HTTP/JSON boundary" — true then, and no longer true: a
  // descriptor now NAMES its control instead of holding it (ADR-0046's
  // split), so it survives JSON like every other field. What still has to
  // be checked is that the name is one the editor knows, or the field
  // renders as a blank space under its label with no error anywhere.
  z.object({
    kind: z.literal('custom'),
    ...themeFieldCommonShape,
    control: customFieldControlSchema,
  }),
  z.object({
    kind: z.enum(['radio', 'select']),
    ...themeFieldCommonShape,
    options: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({
    kind: z.literal('number'),
    ...themeFieldCommonShape,
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({ kind: z.literal('boolean'), ...themeFieldCommonShape }),
]);
export type ThemeFieldDescriptor = z.infer<typeof themeFieldDescriptorSchema>;

// The sidebar categories a theme block can slot into — the same
// buckets `pageBlockCategories` (libs/block-registry/src/lib/config.ts)
// already groups every core block under, reused rather than inventing a
// separate "theme blocks" bucket (apps/editor-app's merge logic places a
// theme block directly alongside the core blocks of the same category).
export const themeBlockCategorySchema = z.enum([
  'layout',
  'content',
  'conversion',
  'media',
  'socialProof',
  'interactive',
  // Added with the shop and local-business blocks: a theme's own product
  // or event block belongs beside core's.
  'shop',
  'localBusiness',
]);
export type ThemeBlockCategory = z.infer<typeof themeBlockCategorySchema>;

export const themeBlockDescriptorSchema = z.object({
  type: z.string(),
  label: z.string(),
  category: themeBlockCategorySchema,
  defaultProps: z.record(z.string(), z.unknown()),
  fields: z.array(themeFieldDescriptorSchema),
  isContainer: z.boolean().optional(),
  allowedChildTypes: z.array(z.string()).optional(),
  stylableProperties: z.array(blockStyleOverrideSchema.keyof()).optional(),
  defaultStyle: blockStyleDefaultsSchema.optional(),
});
export type ThemeBlockDescriptor = z.infer<typeof themeBlockDescriptorSchema>;

// One block's i18n fragment — exactly what would sit under `blocks.<type>`
// in apps/editor-app's own en.json/it.json, without that prefix. Only the
// two locales this product supports today (it/en), same as everywhere
// else generated legal-document/theme content is locale-scoped.
export const themeBlockLocaleFragmentSchema = z.object({
  label: z.string(),
  fields: z
    .record(
      z.string(),
      z.object({
        fieldLabel: z.string(),
        options: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
});
export type ThemeBlockLocaleFragment = z.infer<
  typeof themeBlockLocaleFragmentSchema
>;

export const themeBlockLocalesSchema = z.object({
  en: themeBlockLocaleFragmentSchema,
  it: themeBlockLocaleFragmentSchema,
});
export type ThemeBlockLocales = z.infer<typeof themeBlockLocalesSchema>;

export const themeBlockEntrySchema = z.object({
  descriptor: themeBlockDescriptorSchema,
  locales: themeBlockLocalesSchema,
});
export type ThemeBlockEntry = z.infer<typeof themeBlockEntrySchema>;

export const themeBlocksResponseSchema = z.array(themeBlockEntrySchema);
export type ThemeBlocksResponse = z.infer<typeof themeBlocksResponseSchema>;

/**
 * The looks a theme ADDS to a block type core already ships (ADR-0047,
 * under ADR-0048's additive rule) — the wire shape of
 * `GET /api/themes/current/block-variants`.
 *
 * Keyed by core block type, so a theme extending Button and Hero is two
 * entries rather than a list the editor has to group itself.
 *
 * The label is one string per locale rather than an i18n key: a theme
 * cannot add keys to the editor's own bundles at build time, so its
 * strings travel with the data and are registered into i18next on
 * arrival — the same route `ThemeBlockEntry.locales` already takes for a
 * theme's own block types.
 */
export const themeBlockVariantSchema = z.object({
  value: blockVariantNameSchema,
  label: z.object({ en: z.string().min(1), it: z.string().min(1) }),
});
export type ThemeBlockVariant = z.infer<typeof themeBlockVariantSchema>;

/**
 * Per core block type: the looks the theme adds, and the core looks it
 * `hidden` — ones its own drawing of the block does not have, which the
 * editor then stops offering (a choice that drew nothing, before).
 */
export const themeBlockVariantsEntrySchema = z.object({
  variants: z.array(themeBlockVariantSchema),
  hidden: z.array(blockVariantNameSchema),
});
export type ThemeBlockVariantsEntry = z.infer<
  typeof themeBlockVariantsEntrySchema
>;

export const themeBlockVariantsResponseSchema = z.record(
  blockTypeNameSchema,
  themeBlockVariantsEntrySchema,
);
export type ThemeBlockVariantsResponse = z.infer<
  typeof themeBlockVariantsResponseSchema
>;

/**
 * The style properties a theme ADDS to a block type core already ships
 * (ADR-0047's consequence on `stylableProperties`) — the wire shape of
 * `GET /api/themes/current/block-style-properties`.
 *
 * Keyed by core block type, and carrying everything the editor needs to
 * draw a control for a property it has never heard of: which control,
 * its label per locale, and the options a select offers.
 *
 * The theme does not name the CSS variable — `cardElevation` becomes
 * `--kometio-override-card-elevation`, derived by the emitter. A theme
 * naming its own could point two properties at one variable or collide
 * with a core one, and neither mistake announces itself.
 */
export const themeStylePropertySchema = z.object({
  key: themeStylePropertyKeySchema,
  control: z.enum(['color', 'length', 'select']),
  label: z.object({ en: z.string().min(1), it: z.string().min(1) }),
  placeholder: z.string().optional(),
  options: z.array(z.string().min(1)).optional(),
});
export type ThemeStyleProperty = z.infer<typeof themeStylePropertySchema>;

export const themeStylePropertiesResponseSchema = z.record(
  blockTypeNameSchema,
  z.array(themeStylePropertySchema),
);
export type ThemeStylePropertiesResponse = z.infer<
  typeof themeStylePropertiesResponseSchema
>;
